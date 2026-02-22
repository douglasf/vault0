import type { Vault0Database } from "./connection.js"
import type { Status, Task, TaskDetail, TaskCard } from "../lib/types.js"
import { tasks, taskDependencies, taskStatusHistory, boards } from "./schema.js"
import { and, eq, isNull, or, sql, inArray } from "drizzle-orm"
import { wouldCreateCycle } from "../lib/dag.js"
import { VISIBLE_STATUSES } from "../lib/constants.js"

// ── Helpers ─────────────────────────────────────────────────────────

function isTaskDone(task?: Task): boolean {
  return task?.status === "done"
}

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
    .where(and(eq(tasks.boardId, boardId), isNull(tasks.archivedAt)))
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
export function getTaskCards(db: Vault0Database, boardId: string, opts?: { includeArchived?: boolean }): TaskCard[] {
  const conditions = [eq(tasks.boardId, boardId)]
  if (!opts?.includeArchived) {
    conditions.push(isNull(tasks.archivedAt))
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

/**
 * Get tasks that have all dependencies satisfied (ready to start).
 */
export function getReadyTasks(db: Vault0Database, boardId: string): TaskCard[] {
  return getTaskCards(db, boardId).filter((c) => c.isReady)
}

/**
 * Get tasks that have at least one incomplete dependency.
 */
export function getBlockedTasks(db: Vault0Database, boardId: string): TaskCard[] {
  return getTaskCards(db, boardId).filter((c) => c.isBlocked)
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
  data: Partial<{ title: string; description: string; priority: string; type: string | null; tags: string[] }>,
) {
  const current = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!current) throw new Error(`Task ${taskId} not found`)
  if (current.archivedAt) throw new Error(`Cannot update archived task: ${taskId}`)

  return db
    .update(tasks)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
    .returning()
    .get()
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
  const current = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!current) throw new Error(`Task ${taskId} not found`)
  if (current.archivedAt) throw new Error(`Cannot update status of archived task: ${taskId}`)

  const now = new Date()
  const result: StatusUpdateResult = {}

  db.update(tasks)
    .set({ status: newStatus, updatedAt: now })
    .where(eq(tasks.id, taskId))
    .run()

  db.insert(taskStatusHistory)
    .values({
      taskId,
      fromStatus: current.status,
      toStatus: newStatus,
    })
    .run()

  // Cascade status change to non-archived subtasks that are in the same lane
  // (status) as the parent's old status. Subtasks already in a different lane
  // (e.g. "done") should not be dragged along.
  const subtasks = db
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
    db.update(tasks)
      .set({ status: newStatus, updatedAt: now })
      .where(eq(tasks.id, subtask.id))
      .run()

    db.insert(taskStatusHistory)
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
    const siblings = db
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
      const parent = db.select().from(tasks).where(eq(tasks.id, current.parentId)).get()
      if (parent && parent.status !== "done" && parent.status !== "cancelled" && !parent.archivedAt) {
        db.update(tasks)
          .set({ status: "done", updatedAt: now })
          .where(eq(tasks.id, current.parentId))
          .run()

        db.insert(taskStatusHistory)
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
}

/**
 * Archive all non-archived tasks in the "done" status for a board.
 * Cascades to subtasks of each archived task.
 * Returns the count of top-level tasks archived.
 */
export function archiveDoneTasks(db: Vault0Database, boardId: string): number {
  const doneTasks = db
    .select()
    .from(tasks)
    .where(and(eq(tasks.boardId, boardId), eq(tasks.status, "done"), isNull(tasks.archivedAt)))
    .all()

  for (const task of doneTasks) {
    archiveTask(db, task.id)
  }

  return doneTasks.length
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

  const now = new Date()

  db.update(tasks)
    .set({ archivedAt: now })
    .where(eq(tasks.id, taskId))
    .run()

  // Cascade archive to subtasks
  const subtasks = db
    .select()
    .from(tasks)
    .where(eq(tasks.parentId, taskId))
    .all()

  for (const st of subtasks) {
    db.update(tasks)
      .set({ archivedAt: now })
      .where(eq(tasks.id, st.id))
      .run()
  }

  return { hardDeleted: false }
}

/**
 * Permanently remove a task and all related data from the database.
 * Cascades to subtasks: removes their dependencies, status history, and rows.
 * Also cleans up dependencies and status history for the task itself.
 */
export function hardDeleteTask(db: Vault0Database, taskId: string) {
  const current = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!current) throw new Error(`Task ${taskId} not found`)

  // 1. Hard-delete all subtasks first (they reference this task via parentId)
  const subtasks = db
    .select()
    .from(tasks)
    .where(eq(tasks.parentId, taskId))
    .all()

  for (const subtask of subtasks) {
    // Remove dependencies involving the subtask
    db.delete(taskDependencies)
      .where(or(eq(taskDependencies.taskId, subtask.id), eq(taskDependencies.dependsOn, subtask.id)))
      .run()

    // Remove status history for the subtask
    db.delete(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, subtask.id))
      .run()

    // Remove the subtask row
    db.delete(tasks)
      .where(eq(tasks.id, subtask.id))
      .run()
  }

  // 2. Remove dependencies involving this task (both directions)
  db.delete(taskDependencies)
    .where(or(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOn, taskId)))
    .run()

  // 3. Remove status history for this task
  db.delete(taskStatusHistory)
    .where(eq(taskStatusHistory.taskId, taskId))
    .run()

  // 4. Remove the task row
  db.delete(tasks)
    .where(eq(tasks.id, taskId))
    .run()
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
    .where(eq(tasks.parentId, taskId))
    .all()

  const deps = db
    .select()
    .from(taskDependencies)
    .where(eq(taskDependencies.taskId, taskId))
    .all()

  const depTasks: Task[] = []
  for (const d of deps) {
    const t = db.select().from(tasks).where(eq(tasks.id, d.dependsOn)).get()
    if (t) depTasks.push(t)
  }

  const reverseDeps = db
    .select()
    .from(taskDependencies)
    .where(eq(taskDependencies.dependsOn, taskId))
    .all()

  const dependedOnByTasks: Task[] = []
  for (const d of reverseDeps) {
    const t = db.select().from(tasks).where(eq(tasks.id, d.taskId)).get()
    if (t) dependedOnByTasks.push(t)
  }

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

/**
 * Get the status transition history for a task, newest first.
 */
export function getStatusHistory(db: Vault0Database, taskId: string) {
  return db
    .select()
    .from(taskStatusHistory)
    .where(eq(taskStatusHistory.taskId, taskId))
    .orderBy(sql`${taskStatusHistory.changedAt} DESC`)
    .all()
}
