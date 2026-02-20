import type { Vault0Database } from "./connection.js"
import type { Status, Task, TaskDetail, TaskCard } from "../lib/types.js"
import { tasks, taskDependencies, taskStatusHistory, boards } from "./schema.js"
import { and, eq, isNull, sql } from "drizzle-orm"
import { wouldCreateCycle } from "../lib/dag.js"
import { VISIBLE_STATUSES } from "../lib/constants.js"

// ── Helpers ─────────────────────────────────────────────────────────

function isTaskDone(task?: Task): boolean {
  return task?.status === "done"
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
 * Only returns top-level (non-child) tasks. Each card includes:
 * - dependencyCount: total number of dependencies
 * - blockerCount: number of incomplete dependencies
 * - subtaskTotal/subtaskDone: subtask completion counts
 * - isReady: has dependencies but all are done (eligible to start)
 * - isBlocked: has at least one incomplete dependency
 */
export function getTaskCards(db: Vault0Database, boardId: string): TaskCard[] {
  const allTasks = db
    .select()
    .from(tasks)
    .where(and(eq(tasks.boardId, boardId), isNull(tasks.archivedAt)))
    .all()

  const deps = db.select().from(taskDependencies).all()

  // Build a lookup for quick task resolution
  const taskById = new Map(allTasks.map((t) => [t.id, t]))

  return allTasks
    .filter((t) => t.parentId === null)
    .map((task) => {
      const taskDeps = deps.filter((d) => d.taskId === task.id)
      const dependencyCount = taskDeps.length
      const blockerCount = taskDeps.filter(
        (d) => !isTaskDone(taskById.get(d.dependsOn)),
      ).length

      const subtaskList = allTasks.filter((st) => st.parentId === task.id)
      const subtaskTotal = subtaskList.length
      const subtaskDone = subtaskList.filter((st) => st.status === "done").length

      const isBlocked = blockerCount > 0
      const isReady =
        dependencyCount > 0 &&
        blockerCount === 0 &&
        (task.status === "backlog" || task.status === "todo")

      return {
        ...task,
        dependencyCount,
        blockerCount,
        subtaskTotal,
        subtaskDone,
        isReady,
        isBlocked,
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
    status?: Status
    source?: string
    sourceRef?: string
  },
) {
  const result = db
    .insert(tasks)
    .values({
      boardId: data.boardId,
      parentId: data.parentId,
      title: data.title,
      description: data.description,
      priority: data.priority ?? "normal",
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
 */
export function updateTask(
  db: Vault0Database,
  taskId: string,
  data: Partial<{ title: string; description: string; priority: string; tags: string[] }>,
) {
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
 * Transition a task to a new status and record the change in history.
 */
export function updateTaskStatus(db: Vault0Database, taskId: string, newStatus: Status) {
  const current = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!current) throw new Error(`Task ${taskId} not found`)

  db.update(tasks)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .run()

  db.insert(taskStatusHistory)
    .values({
      taskId,
      fromStatus: current.status,
      toStatus: newStatus,
    })
    .run()
}

/**
 * Soft-delete a task by setting archivedAt. Cascades to subtasks.
 */
export function archiveTask(db: Vault0Database, taskId: string) {
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
}

// ── Dependency Mutations ────────────────────────────────────────────

/**
 * Add a dependency: taskId depends on dependsOnId.
 * Throws if adding the dependency would create a cycle.
 */
export function addDependency(db: Vault0Database, taskId: string, dependsOnId: string) {
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
