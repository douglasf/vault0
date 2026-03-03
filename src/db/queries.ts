import type { Vault0Database } from "./connection.js"
import type { Status, Priority, TaskType, Source, Task, TaskDetail, TaskCard, Release, ReleaseWithTaskCount, VersionInfo, ExportedTask, ExportedDependency, BoardExportEnvelope } from "../lib/types.js"
import { tasks, taskDependencies, taskStatusHistory, boards, releases } from "./schema.js"
import { and, eq, isNull, or, sql, inArray, desc } from "drizzle-orm"
import { wouldCreateCycle } from "../lib/dag.js"
import { VISIBLE_STATUSES } from "../lib/constants.js"
import { ulid } from "ulidx"

// ── Helpers ─────────────────────────────────────────────────────────

function isDependencySatisfied(task?: Task): boolean {
  return task?.status === "done" || task?.status === "in_review"
}

// ── Board Queries ───────────────────────────────────────────────────

export function getBoards(db: Vault0Database) {
  return db
    .select()
    .from(boards)
    .where(isNull(boards.archivedAt))
    .all()
}

export function getBoard(db: Vault0Database, boardId: string) {
  return db.select().from(boards).where(eq(boards.id, boardId)).get()
}

// ── Task Queries ────────────────────────────────────────────────────

/**
 * Get all non-archived tasks for a board, grouped by status.
 * Each status group is sorted by sortOrder ascending.
 */
export function getTasksByStatus(db: Vault0Database, boardId: string): Map<Status, Task[]> {
  const result = db
    .select()
    .from(tasks)
    .where(and(eq(tasks.boardId, boardId), isNull(tasks.archivedAt), isNull(tasks.releaseId)))
    .all()

  const grouped = new Map<Status, Task[]>()
  for (const status of VISIBLE_STATUSES) {
    grouped.set(
      status,
      result
        .filter((t) => t.status === status)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    )
  }

  return grouped
}

/**
 * Get enriched task cards with dependency/subtask metadata.
 * Returns all tasks (both top-level and subtasks) as independent board items.
 * Each card includes:
 * - dependencyCount: total number of dependencies
 * - blockerCount: number of incomplete dependencies
 * - subtaskTotal/subtaskDone: subtask completion counts (for parent tasks)
 * - isReady: no unmet dependencies (eligible to start — includes tasks with zero deps)
 * - isBlocked: has at least one incomplete dependency
 * - parentTitle: title of the parent task (for subtasks)
 */
export function getTaskCards(db: Vault0Database, boardId: string, opts?: { includeArchived?: boolean; includeReleased?: boolean }): TaskCard[] {
  const conditions = [eq(tasks.boardId, boardId)]
  if (!opts?.includeArchived) {
    conditions.push(isNull(tasks.archivedAt))
  }
  if (!opts?.includeReleased) {
    conditions.push(isNull(tasks.releaseId))
  }

  const allTasks = db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .all()

  // Only fetch dependencies involving tasks on this board (not the entire table)
  const taskIds = allTasks.map((t) => t.id)
  const deps = taskIds.length > 0
    ? db.select().from(taskDependencies).where(inArray(taskDependencies.taskId, taskIds)).all()
    : []

  // Build a lookup for quick task resolution
  const taskById = new Map(allTasks.map((t) => [t.id, t]))

  return allTasks
    .map((task) => {
      const taskDeps = deps.filter((d) => d.taskId === task.id)
      const dependencyCount = taskDeps.length
      const blockerCount = taskDeps.filter(
        (d) => !isDependencySatisfied(taskById.get(d.dependsOn)),
      ).length

      const subtaskList = allTasks.filter((st) => st.parentId === task.id)
      const subtaskTotal = subtaskList.length
      const subtaskDone = subtaskList.filter((st) => st.status === "done").length

      const isBlocked = blockerCount > 0
      const isReady =
        !isBlocked &&
        (task.status === "backlog" || task.status === "todo")

      // Resolve parent title for subtasks
      const parentTitle = task.parentId ? taskById.get(task.parentId)?.title : undefined

      return {
        ...task,
        dependencyCount,
        blockerCount,
        subtaskTotal,
        subtaskDone,
        isReady,
        isBlocked,
        parentTitle,
      }
    })
}

// ── Task Mutations ──────────────────────────────────────────────────

/**
 * Create a new task and record its initial status in history.
 */
export function createTask(
  db: Vault0Database,
  data: {
    boardId: string
    parentId?: string
    title: string
    description?: string
    priority?: string
    type?: string
    status?: Status
    source?: string
    sourceRef?: string
  },
) {
  // Prevent creating subtasks of subtasks — only top-level tasks can have children
  if (data.parentId) {
    const parent = db.select().from(tasks).where(eq(tasks.id, data.parentId)).get()
    if (!parent) throw new Error(`Parent task ${data.parentId} not found`)
    if (parent.parentId) {
      throw new Error("Cannot add a subtask to a subtask. Only top-level tasks can have subtasks.")
    }
  }

  const result = db
    .insert(tasks)
    .values({
      boardId: data.boardId,
      parentId: data.parentId,
      title: data.title,
      description: data.description,
      priority: data.priority ?? "normal",
      type: data.type,
      status: data.status ?? "backlog",
      source: data.source ?? "manual",
      sourceRef: data.sourceRef,
    })
    .returning()
    .get()

  // Record initial status history entry
  db.insert(taskStatusHistory)
    .values({
      taskId: result.id,
      fromStatus: undefined,
      toStatus: result.status,
    })
    .run()

  return result
}

/**
 * Update task metadata (title, description, priority, tags).
 * Throws if the task does not exist or is archived.
 */
export function updateTask(
  db: Vault0Database,
  taskId: string,
  data: Partial<{ title: string; description: string; priority: string; type: string | null; tags: string[]; solution: string | null }>,
) {
  return db.transaction((tx) => {
    const current = tx.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!current) throw new Error(`Task ${taskId} not found`)
    if (current.archivedAt) throw new Error(`Cannot update archived task: ${taskId}`)

    return tx
      .update(tasks)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
      .returning()
      .get()
  })
}

/**
 * Result of a status update, including any side effects.
 */
export interface StatusUpdateResult {
  /** If a parent task was auto-completed because all subtasks are done. */
  parentAutoCompleted?: { id: string; title: string }
}

/**
 * Transition a task to a new status and record the change in history.
 * When a parent task is moved, non-archived subtasks that are in the same
 * lane (status) as the parent are moved along. Subtasks already in a
 * different lane (e.g. "done") are left untouched.
 * When a subtask is moved to "done" and all sibling subtasks are also "done",
 * the parent task is automatically moved to "done" as well.
 * Throws if the task does not exist or is archived.
 */
export function updateTaskStatus(db: Vault0Database, taskId: string, newStatus: Status): StatusUpdateResult {
  return db.transaction((tx) => {
    const current = tx.select().from(tasks).where(eq(tasks.id, taskId)).get()
    if (!current) throw new Error(`Task ${taskId} not found`)
    if (current.archivedAt) throw new Error(`Cannot update status of archived task: ${taskId}`)

    const now = new Date()
    const result: StatusUpdateResult = {}

    tx.update(tasks)
      .set({ status: newStatus, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .run()

    tx.insert(taskStatusHistory)
      .values({
        taskId,
        fromStatus: current.status,
        toStatus: newStatus,
      })
      .run()

    // Cascade status change to non-archived subtasks that are in the same lane
    // (status) as the parent's old status. Subtasks already in a different lane
    // (e.g. "done") should not be dragged along.
    const subtasks = tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.parentId, taskId),
          isNull(tasks.archivedAt),
          eq(tasks.status, current.status),
        ),
      )
      .all()

    for (const subtask of subtasks) {
      tx.update(tasks)
        .set({ status: newStatus, updatedAt: now })
        .where(eq(tasks.id, subtask.id))
        .run()

      tx.insert(taskStatusHistory)
        .values({
          taskId: subtask.id,
          fromStatus: subtask.status,
          toStatus: newStatus,
        })
        .run()
    }

    // Auto-complete parent when all sibling subtasks are done.
    // Only triggers when a subtask moves to "done" and has a parent.
    if (newStatus === "done" && current.parentId) {
      const siblings = tx
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.parentId, current.parentId),
            isNull(tasks.archivedAt),
          ),
        )
        .all()

      const allDone = siblings.length > 0 && siblings.every((s) => s.status === "done")

      if (allDone) {
        const parent = tx.select().from(tasks).where(eq(tasks.id, current.parentId)).get()
        if (parent && parent.status !== "done" && parent.status !== "cancelled" && !parent.archivedAt) {
          tx.update(tasks)
            .set({ status: "done", updatedAt: now })
            .where(eq(tasks.id, current.parentId))
            .run()

          tx.insert(taskStatusHistory)
            .values({
              taskId: current.parentId,
              fromStatus: parent.status,
              toStatus: "done",
            })
            .run()

          result.parentAutoCompleted = { id: parent.id, title: parent.title }
        }
      }
    }

    return result
  }, { behavior: "immediate" })
}

/**
 * Archive all non-archived tasks in the "done" status for a board.
 * Cascades to subtasks of each archived task.
 * Returns the count of top-level tasks archived.
 */
export function archiveDoneTasks(db: Vault0Database, boardId: string): number {
  return db.transaction((tx) => {
    const doneTasks = tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.boardId, boardId), eq(tasks.status, "done"), isNull(tasks.archivedAt)))
      .all()

    const now = new Date()
    for (const task of doneTasks) {
      // Archive the task
      tx.update(tasks)
        .set({ archivedAt: now })
        .where(eq(tasks.id, task.id))
        .run()

      // Cascade archive to subtasks
      tx.update(tasks)
        .set({ archivedAt: now })
        .where(and(eq(tasks.parentId, task.id), isNull(tasks.archivedAt)))
        .run()
    }

    return doneTasks.length
  })
}

/**
 * Soft-delete a task by setting archivedAt. Cascades to subtasks.
 * If the task is already archived, performs a hard delete (permanent removal).
 * Returns an object indicating which operation was performed.
 */
export function archiveTask(db: Vault0Database, taskId: string): { hardDeleted: boolean } {
  const current = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!current) throw new Error(`Task ${taskId} not found`)

  // Already archived — hard delete (permanent removal)
  if (current.archivedAt) {
    hardDeleteTask(db, taskId)
    return { hardDeleted: true }
  }

  return db.transaction((tx) => {
    const now = new Date()

    tx.update(tasks)
      .set({ archivedAt: now })
      .where(eq(tasks.id, taskId))
      .run()

    // Cascade archive to subtasks
    const subtasks = tx
      .select()
      .from(tasks)
      .where(eq(tasks.parentId, taskId))
      .all()

    for (const st of subtasks) {
      tx.update(tasks)
        .set({ archivedAt: now })
        .where(eq(tasks.id, st.id))
        .run()
    }

    return { hardDeleted: false }
  })
}

/**
 * Unarchive (restore) a previously archived task by clearing archivedAt.
 * Cascades to subtasks — all archived subtasks are also restored.
 * Throws if the task does not exist or is not archived.
 */
export function unarchiveTask(db: Vault0Database, taskId: string): void {
  const current = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!current) throw new Error(`Task ${taskId} not found`)
  if (!current.archivedAt) throw new Error(`Task ${taskId} is not archived`)

  db.update(tasks)
    .set({ archivedAt: null })
    .where(eq(tasks.id, taskId))
    .run()

  // Cascade unarchive to subtasks
  const subtasks = db
    .select()
    .from(tasks)
    .where(eq(tasks.parentId, taskId))
    .all()

  for (const st of subtasks) {
    if (st.archivedAt) {
      db.update(tasks)
        .set({ archivedAt: null })
        .where(eq(tasks.id, st.id))
        .run()
    }
  }
}

/**
 * Permanently remove a task and all related data from the database.
 * Cascades to subtasks: removes their dependencies, status history, and rows.
 * Also cleans up dependencies and status history for the task itself.
 */
export function hardDeleteTask(db: Vault0Database, taskId: string) {
  const current = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!current) throw new Error(`Task ${taskId} not found`)

  db.transaction((tx) => {
    // 1. Hard-delete all subtasks first (they reference this task via parentId)
    const subtasks = tx
      .select()
      .from(tasks)
      .where(eq(tasks.parentId, taskId))
      .all()

    for (const subtask of subtasks) {
      // Remove dependencies involving the subtask
      tx.delete(taskDependencies)
        .where(or(eq(taskDependencies.taskId, subtask.id), eq(taskDependencies.dependsOn, subtask.id)))
        .run()

      // Remove status history for the subtask
      tx.delete(taskStatusHistory)
        .where(eq(taskStatusHistory.taskId, subtask.id))
        .run()

      // Remove the subtask row
      tx.delete(tasks)
        .where(eq(tasks.id, subtask.id))
        .run()
    }

    // 2. Remove dependencies involving this task (both directions)
    tx.delete(taskDependencies)
      .where(or(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOn, taskId)))
      .run()

    // 3. Remove status history for this task
    tx.delete(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, taskId))
      .run()

    // 4. Remove the task row
    tx.delete(tasks)
      .where(eq(tasks.id, taskId))
      .run()
  })
}

// ── Dependency Mutations ────────────────────────────────────────────

/**
 * Add a dependency: taskId depends on dependsOnId.
 * Throws if adding the dependency would create a cycle,
 * or if either task does not exist or is archived.
 */
export function addDependency(db: Vault0Database, taskId: string, dependsOnId: string) {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!task) throw new Error(`Task ${taskId} not found`)
  if (task.archivedAt) throw new Error(`Cannot add dependency to archived task: ${taskId}`)

  const depTask = db.select().from(tasks).where(eq(tasks.id, dependsOnId)).get()
  if (!depTask) throw new Error(`Dependency target ${dependsOnId} not found`)
  if (depTask.archivedAt) throw new Error(`Cannot depend on archived task: ${dependsOnId}`)

  if (wouldCreateCycle(db, taskId, dependsOnId)) {
    throw new Error(`Cannot add dependency: would create cycle (${taskId} -> ${dependsOnId})`)
  }

  db.insert(taskDependencies)
    .values({ taskId, dependsOn: dependsOnId })
    .run()
}

/**
 * Remove a dependency between two tasks.
 */
export function removeDependency(db: Vault0Database, taskId: string, dependsOnId: string) {
  db.delete(taskDependencies)
    .where(
      and(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOn, dependsOnId)),
    )
    .run()
}

// ── Detail & History ────────────────────────────────────────────────

/**
 * Get full task detail including subtasks, dependencies (both directions),
 * and status history.
 */
export function getTaskDetail(db: Vault0Database, taskId: string): TaskDetail {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!task) throw new Error(`Task ${taskId} not found`)

  const subtaskList = db
    .select()
    .from(tasks)
    .where(and(eq(tasks.parentId, taskId), isNull(tasks.archivedAt)))
    .all()

  const deps = db
    .select()
    .from(taskDependencies)
    .where(eq(taskDependencies.taskId, taskId))
    .all()

  // Batch-load dependency tasks (avoids N+1)
  const depIds = deps.map(d => d.dependsOn)
  const depTasksUnordered = depIds.length > 0
    ? db.select().from(tasks).where(inArray(tasks.id, depIds)).all()
    : []
  // Preserve original dependency order
  const depTaskMap = new Map(depTasksUnordered.map(t => [t.id, t]))
  const depTasks = depIds.map(id => depTaskMap.get(id)).filter((t): t is Task => t != null)

  const reverseDeps = db
    .select()
    .from(taskDependencies)
    .where(eq(taskDependencies.dependsOn, taskId))
    .all()

  // Batch-load reverse dependency tasks (avoids N+1)
  const reverseDepIds = reverseDeps.map(d => d.taskId)
  const reverseDepTasksUnordered = reverseDepIds.length > 0
    ? db.select().from(tasks).where(inArray(tasks.id, reverseDepIds)).all()
    : []
  const reverseDepTaskMap = new Map(reverseDepTasksUnordered.map(t => [t.id, t]))
  const dependedOnByTasks = reverseDepIds.map(id => reverseDepTaskMap.get(id)).filter((t): t is Task => t != null)

  const history = db
    .select()
    .from(taskStatusHistory)
    .where(eq(taskStatusHistory.taskId, taskId))
    .orderBy(sql`${taskStatusHistory.changedAt} DESC`)
    .all()

  return {
    ...task,
    subtasks: subtaskList,
    dependsOn: depTasks,
    dependedOnBy: dependedOnByTasks,
    statusHistory: history,
  }
}

// ── Release Queries ─────────────────────────────────────────────────

/**
 * Get all releases for a board, newest first.
 * Each release includes a count of associated tasks.
 */
export function getReleases(db: Vault0Database, boardId: string): ReleaseWithTaskCount[] {
  const allReleases = db
    .select()
    .from(releases)
    .where(eq(releases.boardId, boardId))
    .orderBy(desc(releases.createdAt), desc(releases.id))
    .all()

  return allReleases.map((release) => {
    const taskCount = db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(eq(tasks.releaseId, release.id))
      .get()

    return {
      ...release,
      taskCount: taskCount?.count ?? 0,
    }
  })
}

/**
 * Get a single release by ID.
 */
export function getRelease(db: Vault0Database, releaseId: string): Release | undefined {
  return db.select().from(releases).where(eq(releases.id, releaseId)).get()
}

/**
 * Get all tasks belonging to a release.
 */
export function getReleaseTasks(db: Vault0Database, releaseId: string): Task[] {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.releaseId, releaseId))
    .all()
}

/**
 * Create a release and assign selected top-level tasks (and their subtasks) to it.
 * Returns the created release.
 */
export function createRelease(
  db: Vault0Database,
  data: {
    boardId: string
    name: string
    description?: string
    versionInfo?: VersionInfo
    taskIds: string[]
  },
): Release {
  return db.transaction((tx) => {
    const release = tx
      .insert(releases)
      .values({
        boardId: data.boardId,
        name: data.name,
        description: data.description,
        versionInfo: data.versionInfo,
      })
      .returning()
      .get()

    // Assign selected tasks and their subtasks to the release
    for (const taskId of data.taskIds) {
      tx.update(tasks)
        .set({ releaseId: release.id, updatedAt: new Date() })
        .where(eq(tasks.id, taskId))
        .run()

      // Also include all subtasks of this task
      const subtasks = tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.parentId, taskId), isNull(tasks.archivedAt)))
        .all()
      for (const sub of subtasks) {
        tx.update(tasks)
          .set({ releaseId: release.id, updatedAt: new Date() })
          .where(eq(tasks.id, sub.id))
          .run()
      }
    }

    return release
  })
}

/**
 * Get only top-level tasks (no subtasks) belonging to a release.
 */
export function getReleaseTopLevelTasks(db: Vault0Database, releaseId: string): Task[] {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.releaseId, releaseId), isNull(tasks.parentId)))
    .all()
}

/**
 * Get subtasks of a specific task within a release.
 */
export function getReleaseTaskSubtasks(db: Vault0Database, taskId: string): Task[] {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.parentId, taskId))
    .all()
}

/**
 * Delete a release record and restore all its tasks to the board.
 * Sets releaseId = null on all tasks (and subtasks) in the release,
 * then deletes the release record itself.
 * Returns the number of tasks restored.
 */
export function deleteRelease(db: Vault0Database, releaseId: string): number {
  return db.transaction((tx) => {
    const releaseTasks = tx
      .select()
      .from(tasks)
      .where(eq(tasks.releaseId, releaseId))
      .all()

    for (const task of releaseTasks) {
      tx.update(tasks)
        .set({ releaseId: null, updatedAt: new Date() })
        .where(eq(tasks.id, task.id))
        .run()
    }

    tx.delete(releases)
      .where(eq(releases.id, releaseId))
      .run()

    return releaseTasks.length
  })
}

/**
 * Restore a task from a release back to the main board.
 * Sets releaseId to null — the task keeps its original status.
 */
export function restoreTaskFromRelease(db: Vault0Database, taskId: string): void {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!task) throw new Error(`Task ${taskId} not found`)
  if (!task.releaseId) throw new Error(`Task ${taskId} is not in a release`)

  db.update(tasks)
    .set({ releaseId: null, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .run()
}

/**
 * Restore all tasks from a release back to the main board.
 * Returns the number of tasks restored.
 */
export function restoreAllFromRelease(db: Vault0Database, releaseId: string): number {
  const releaseTasks = db
    .select()
    .from(tasks)
    .where(eq(tasks.releaseId, releaseId))
    .all()

  for (const task of releaseTasks) {
    db.update(tasks)
      .set({ releaseId: null, updatedAt: new Date() })
      .where(eq(tasks.id, task.id))
      .run()
  }

  return releaseTasks.length
}

// ── Import ──────────────────────────────────────────────────────────

export interface ImportResult {
  /** Number of tasks imported (including subtasks) */
  taskCount: number
  /** Number of dependencies imported */
  dependencyCount: number
  /** Mapping from old task IDs to new ULIDs */
  idMap: Map<string, string>
}

/**
 * Import tasks from an export structure into the given board.
 * Generates new ULIDs for all tasks, remaps parentId and dependencies.
 * Runs in an atomic transaction.
 */
export function importTasks(
  db: Vault0Database,
  boardId: string,
  exportedTasks: ExportedTask[],
  exportedDeps?: ExportedDependency[],
): ImportResult {
  return db.transaction((tx) => {
    const idMap = new Map<string, string>()
    let taskCount = 0

    /** Recursively insert a task and its subtasks */
    function insertTask(exported: ExportedTask, parentId?: string): void {
      const newId = ulid()
      idMap.set(exported.id, newId)

      tx.insert(tasks)
        .values({
          id: newId,
          boardId,
          parentId: parentId ?? null,
          title: exported.title,
          description: exported.description ?? null,
          status: exported.status ?? "backlog",
          priority: exported.priority ?? "normal",
          type: exported.type ?? null,
          source: "import",
          sourceRef: exported.sourceRef ?? null,
          tags: exported.tags ?? [],
          solution: exported.solution ?? null,
          sortOrder: exported.sortOrder ?? 0,
        })
        .run()

      // Record initial status history
      tx.insert(taskStatusHistory)
        .values({
          taskId: newId,
          fromStatus: undefined,
          toStatus: exported.status ?? "backlog",
        })
        .run()

      taskCount++

      // Recurse into subtasks
      if (exported.subtasks && exported.subtasks.length > 0) {
        for (const subtask of exported.subtasks) {
          insertTask(subtask, newId)
        }
      }
    }

    // Insert all top-level tasks (with nested subtasks)
    for (const exported of exportedTasks) {
      insertTask(exported)
    }

    // Remap and insert dependencies
    let dependencyCount = 0
    if (exportedDeps && exportedDeps.length > 0) {
      for (const dep of exportedDeps) {
        const newTaskId = idMap.get(dep.taskId)
        const newDependsOn = idMap.get(dep.dependsOn)
        if (newTaskId && newDependsOn) {
          tx.insert(taskDependencies)
            .values({ taskId: newTaskId, dependsOn: newDependsOn })
            .run()
          dependencyCount++
        }
      }
    }

    return { taskCount, dependencyCount, idMap }
  }, { behavior: "immediate" })
}

// ── Board Export ────────────────────────────────────────────────────

/**
 * Export an entire board as a BoardExportEnvelope.
 * Fetches board metadata, all non-archived tasks (nested), and dependencies.
 */
export function exportBoard(db: Vault0Database, boardId: string): BoardExportEnvelope {
  const board = getBoard(db, boardId)
  if (!board) throw new Error(`Board ${boardId} not found`)

  // Fetch all non-archived tasks for this board
  const allTasks = db
    .select()
    .from(tasks)
    .where(and(eq(tasks.boardId, boardId), isNull(tasks.archivedAt)))
    .all()

  const taskIds = allTasks.map((t) => t.id)

  // Fetch all dependencies between these tasks
  const deps = taskIds.length > 0
    ? db.select().from(taskDependencies).where(inArray(taskDependencies.taskId, taskIds)).all()
    : []

  // Build exported tasks — top-level only, with subtasks nested
  const topLevel = allTasks.filter((t) => !t.parentId)
  const byParent = new Map<string, typeof allTasks>()
  for (const t of allTasks) {
    if (t.parentId) {
      const siblings = byParent.get(t.parentId) ?? []
      siblings.push(t)
      byParent.set(t.parentId, siblings)
    }
  }

  function toExported(t: typeof allTasks[number]): ExportedTask {
    const children = byParent.get(t.id)
    const exported: ExportedTask = {
      id: t.id,
      title: t.title,
      description: t.description ?? null,
      status: t.status as Status,
      priority: t.priority as Priority,
      type: (t.type as TaskType) ?? null,
      source: (t.source as Source) ?? null,
      sourceRef: t.sourceRef ?? null,
      tags: (t.tags as string[]) ?? [],
      solution: t.solution ?? null,
      sortOrder: t.sortOrder,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
    }
    if (children && children.length > 0) {
      exported.subtasks = children.map(toExported)
    }
    return exported
  }

  const exportedTasks = topLevel.map(toExported)

  const exportedDeps: ExportedDependency[] = deps
    .filter((d) => taskIds.includes(d.dependsOn))
    .map((d) => ({ taskId: d.taskId, dependsOn: d.dependsOn }))

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    board: {
      id: board.id,
      name: board.name,
      description: board.description ?? null,
    },
    tasks: exportedTasks,
    dependencies: exportedDeps,
  }
}

/**
 * Import an entire board from a BoardExportEnvelope.
 * Delegates to importTasks for the actual task/dependency insertion.
 * @param db Database instance
 * @param boardId Target board to import into
 * @param envelope The parsed BoardExportEnvelope
 */
export function importBoard(
  db: Vault0Database,
  boardId: string,
  envelope: BoardExportEnvelope,
): ImportResult {
  return importTasks(db, boardId, envelope.tasks, envelope.dependencies)
}
