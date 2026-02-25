import type { Vault0Database } from "../db/connection.js"
import type { Status, Priority, Source, TaskType } from "../lib/types.js"
import { tasks } from "../db/schema.js"
import { eq, sql } from "drizzle-orm"
import {
  createTask,
  updateTask,
  updateTaskStatus,
  archiveTask,
  unarchiveTask,
  getTaskCards,
  getTaskDetail,
  getBoards,
  addDependency,
  removeDependency,
} from "../db/queries.js"
import {
  formatTaskList,
  formatTaskDetail,
  formatBoard,
  formatSuccess,
  formatError,
  jsonOutput,
  type OutputFormat,
} from "./format.js"

// ── Valid Values ─────────────────────────────────────────────────────

const VALID_STATUSES: Status[] = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]
const VALID_PRIORITIES: Priority[] = ["critical", "high", "normal", "low"]
const VALID_SOURCES: Source[] = ["manual", "todo_md", "opencode", "opencode-plan", "import"]
const VALID_TASK_TYPES: TaskType[] = ["feature", "bug", "analysis"]

function validateStatus(s: string): Status {
  if (!VALID_STATUSES.includes(s as Status)) {
    throw new Error(`Invalid status: "${s}". Must be one of: ${VALID_STATUSES.join(", ")}`)
  }
  return s as Status
}

function validatePriority(p: string): Priority {
  if (!VALID_PRIORITIES.includes(p as Priority)) {
    throw new Error(`Invalid priority: "${p}". Must be one of: ${VALID_PRIORITIES.join(", ")}`)
  }
  return p as Priority
}

function validateSource(s: string): Source {
  if (!VALID_SOURCES.includes(s as Source)) {
    throw new Error(`Invalid source: "${s}". Must be one of: ${VALID_SOURCES.join(", ")}`)
  }
  return s as Source
}

function validateTaskType(t: string): TaskType {
  if (!VALID_TASK_TYPES.includes(t as TaskType)) {
    throw new Error(`Invalid type: "${t}". Must be one of: ${VALID_TASK_TYPES.join(", ")}`)
  }
  return t as TaskType
}

// ── Helpers ─────────────────────────────────────────────────────────

function getDefaultBoardId(db: Vault0Database): string {
  const allBoards = getBoards(db)
  if (allBoards.length === 0) {
    throw new Error("No boards found. Launch the TUI first to create a default board.")
  }
  return allBoards[0].id
}

function resolveTaskId(db: Vault0Database, idFragment: string): string {
  // Try exact match first
  const exact = db.select().from(tasks).where(eq(tasks.id, idFragment)).get()
  if (exact) return exact.id

  // Try suffix match via SQL (avoids loading all IDs to JS)
  const matches = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(sql`${tasks.id} LIKE ${`%${idFragment}`}`)
    .all()

  if (matches.length === 0) {
    throw new Error(`No task found matching ID: "${idFragment}"`)
  }
  if (matches.length > 1) {
    const ids = matches.map((m) => m.id.slice(-12)).join(", ")
    throw new Error(`Ambiguous ID "${idFragment}" matches ${matches.length} tasks: ${ids}. Use more characters.`)
  }

  return matches[0].id
}

// ── Commands ────────────────────────────────────────────────────────

export interface CommandResult {
  success: boolean
  message: string
  data?: unknown
}

/**
 * vault0 task add --title "..." [--description "..."] [--priority ...] [--status ...] [--parent ID] [--tags t1,t2] [--board ID] [--source ...] [--source-ref ...]
 */
export function cmdAdd(db: Vault0Database, flags: Record<string, string>, format: OutputFormat): CommandResult {
  const title = flags.title
  if (!title) {
    return { success: false, message: formatError("--title is required") }
  }

  const boardId = flags.board || getDefaultBoardId(db)
  const priority = flags.priority ? validatePriority(flags.priority) : undefined
  const status = flags.status ? validateStatus(flags.status) : undefined
  const parentId = flags.parent ? resolveTaskId(db, flags.parent) : undefined
  const source = flags.source ? validateSource(flags.source) : undefined
  const sourceRef = flags["source-ref"] || undefined
  const type = flags.type ? validateTaskType(flags.type) : undefined

  // Prevent creating subtasks of subtasks — only top-level tasks can have children
  if (parentId) {
    const parentTask = db.select().from(tasks).where(eq(tasks.id, parentId)).get()
    if (parentTask?.parentId) {
      return {
        success: false,
        message: formatError("Cannot add a subtask to a subtask. Only top-level tasks can have subtasks."),
      }
    }
  }

  const task = createTask(db, {
    boardId,
    parentId,
    title,
    description: flags.description,
    priority: priority ?? undefined,
    type,
    status,
    source,
    sourceRef,
  })

  // Handle tags separately since createTask doesn't accept them
  let finalTask = task
  if (flags.tags) {
    const tagList = flags.tags.split(",").map((t) => t.trim()).filter(Boolean)
    if (tagList.length > 0) {
      finalTask = updateTask(db, task.id, { tags: tagList })
    }
  }

  if (format === "json") {
    return { success: true, message: jsonOutput(finalTask), data: finalTask }
  }

  return {
    success: true,
    message: formatSuccess(`Task created: [${finalTask.id.slice(-8)}] ${finalTask.title}`),
    data: finalTask,
  }
}

/**
 * vault0 task list [--status ...] [--priority ...] [--search ...] [--board ID] [--all]
 */
export function cmdList(db: Vault0Database, flags: Record<string, string>, format: OutputFormat): CommandResult {
  const boardId = flags.board || getDefaultBoardId(db)
  let cards = getTaskCards(db, boardId)

  // Apply filters
  if (flags.status) {
    const status = validateStatus(flags.status)
    cards = cards.filter((c) => c.status === status)
  }

  if (flags.priority) {
    const priority = validatePriority(flags.priority)
    cards = cards.filter((c) => c.priority === priority)
  }

  if (flags.search) {
    const search = flags.search.toLowerCase()
    cards = cards.filter((c) =>
      c.title.toLowerCase().includes(search) ||
      c.description?.toLowerCase().includes(search)
    )
  }

  if (flags.blocked === "true" || flags.blocked === "") {
    cards = cards.filter((c) => c.isBlocked)
  }

  if (flags.ready === "true" || flags.ready === "") {
    cards = cards.filter((c) => c.isReady)
  }

  if (format === "json") {
    return { success: true, message: jsonOutput(cards), data: cards }
  }

  return { success: true, message: formatTaskList(cards), data: cards }
}

/**
 * vault0 task view <ID>
 */
export function cmdView(db: Vault0Database, taskId: string, format: OutputFormat): CommandResult {
  if (!taskId) {
    return { success: false, message: formatError("Task ID is required. Usage: vault0 task view <ID>") }
  }

  const resolvedId = resolveTaskId(db, taskId)
  const detail = getTaskDetail(db, resolvedId)

  if (format === "json") {
    return { success: true, message: jsonOutput(detail), data: detail }
  }

  return { success: true, message: formatTaskDetail(detail), data: detail }
}

/**
 * vault0 task edit <ID> [--title "..."] [--description "..."] [--priority ...] [--tags t1,t2]
 *   [--dep-add <ID>] [--dep-remove <ID>] [--dep-list]
 */
export function cmdEdit(db: Vault0Database, taskId: string, flags: Record<string, string>, format: OutputFormat): CommandResult {
  if (!taskId) {
    return { success: false, message: formatError("Task ID is required. Usage: vault0 task edit <ID> --title ...") }
  }

  const resolvedId = resolveTaskId(db, taskId)

  // ── Dependency operations (handled first, mutually exclusive with field updates) ──

  if (flags["dep-list"] === "true" || flags["dep-list"] === "") {
    return cmdDepList(db, resolvedId, format)
  }

  if (flags["dep-add"]) {
    return cmdDepAdd(db, resolvedId, flags["dep-add"], format)
  }

  if (flags["dep-remove"]) {
    return cmdDepRemove(db, resolvedId, flags["dep-remove"], format)
  }

  // ── Field updates ──

  const updates: Partial<{ title: string; description: string; priority: string; type: string | null; tags: string[]; solution: string | null }> = {}

  if (flags.title) updates.title = flags.title
  if (flags.description !== undefined) updates.description = flags.description
  if (flags.priority) updates.priority = validatePriority(flags.priority)
  if (flags.type !== undefined) {
    updates.type = flags.type ? validateTaskType(flags.type) : null
  }
  if (flags.tags !== undefined) {
    updates.tags = flags.tags.split(",").map((t) => t.trim()).filter(Boolean)
  }
  if (flags.solution !== undefined) {
    updates.solution = flags.solution || null
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, message: formatError("No updates specified. Use --title, --description, --priority, --type, --tags, --solution, --dep-add, --dep-remove, or --dep-list.") }
  }

  const updated = updateTask(db, resolvedId, updates)

  if (format === "json") {
    return { success: true, message: jsonOutput(updated), data: updated }
  }

  return {
    success: true,
    message: formatSuccess(`Task updated: [${resolvedId.slice(-8)}] ${updated.title}`),
    data: updated,
  }
}

/**
 * vault0 task move <ID> --status <STATUS>
 */
export function cmdMove(db: Vault0Database, taskId: string, flags: Record<string, string>, format: OutputFormat): CommandResult {
  if (!taskId) {
    return { success: false, message: formatError("Task ID is required. Usage: vault0 task move <ID> --status done") }
  }
  if (!flags.status) {
    return { success: false, message: formatError("--status is required. Usage: vault0 task move <ID> --status done") }
  }

  const resolvedId = resolveTaskId(db, taskId)
  const newStatus = validateStatus(flags.status)

  const { parentAutoCompleted } = updateTaskStatus(db, resolvedId, newStatus)

  // If a solution was provided, save it on the task
  if (flags.solution !== undefined) {
    updateTask(db, resolvedId, { solution: flags.solution || null })
  }

  // Fetch updated task for output
  const task = db.select().from(tasks).where(eq(tasks.id, resolvedId)).get()

  if (format === "json") {
    return { success: true, message: jsonOutput({ ...task, parentAutoCompleted }), data: task }
  }

  let msg = formatSuccess(`Task [${resolvedId.slice(-8)}] moved to ${newStatus}`)
  if (parentAutoCompleted) {
    msg += `\n${formatSuccess(`Parent task [${parentAutoCompleted.id.slice(-8)}] ${parentAutoCompleted.title} auto-completed (all subtasks done)`)}`
  }

  return {
    success: true,
    message: msg,
    data: task,
  }
}

/**
 * vault0 task delete <ID>
 * First delete: archives (soft-delete). Second delete: permanently removes (hard-delete).
 */
export function cmdDelete(db: Vault0Database, taskId: string, format: OutputFormat): CommandResult {
  if (!taskId) {
    return { success: false, message: formatError("Task ID is required. Usage: vault0 task delete <ID>") }
  }

  const resolvedId = resolveTaskId(db, taskId)

  // Get task info before deletion
  const task = db.select().from(tasks).where(eq(tasks.id, resolvedId)).get()
  const { hardDeleted } = archiveTask(db, resolvedId)

  if (format === "json") {
    return { success: true, message: jsonOutput({ archived: !hardDeleted, hardDeleted, id: resolvedId, title: task?.title }), data: task }
  }

  const action = hardDeleted ? "permanently deleted" : "archived"
  return {
    success: true,
    message: formatSuccess(`Task ${action}: [${resolvedId.slice(-8)}] ${task?.title}`),
    data: task,
  }
}

/**
 * vault0 task unarchive <ID>
 * Restores a previously archived (soft-deleted) task. Cascades to subtasks.
 */
export function cmdUnarchive(db: Vault0Database, taskId: string, format: OutputFormat): CommandResult {
  if (!taskId) {
    return { success: false, message: formatError("Task ID is required. Usage: vault0 task unarchive <ID>") }
  }

  const resolvedId = resolveTaskId(db, taskId)
  unarchiveTask(db, resolvedId)

  const task = db.select().from(tasks).where(eq(tasks.id, resolvedId)).get()

  if (format === "json") {
    return { success: true, message: jsonOutput({ unarchived: true, id: resolvedId, title: task?.title }), data: task }
  }

  return {
    success: true,
    message: formatSuccess(`Task unarchived: [${resolvedId.slice(-8)}] ${task?.title}`),
    data: task,
  }
}

/**
 * Internal: Add dependency (used by cmdEdit --dep-add)
 * @param resolvedTaskId Already-resolved full task ID
 * @param depIdFragment Raw dep ID (will be resolved)
 */
function cmdDepAdd(db: Vault0Database, resolvedTaskId: string, depIdFragment: string, format: OutputFormat): CommandResult {
  const resolvedDepId = resolveTaskId(db, depIdFragment)

  addDependency(db, resolvedTaskId, resolvedDepId)

  if (format === "json") {
    return { success: true, message: jsonOutput({ taskId: resolvedTaskId, dependsOn: resolvedDepId }), data: true }
  }

  return {
    success: true,
    message: formatSuccess(`Dependency added: [${resolvedTaskId.slice(-8)}] depends on [${resolvedDepId.slice(-8)}]`),
  }
}

/**
 * Internal: Remove dependency (used by cmdEdit --dep-remove)
 * @param resolvedTaskId Already-resolved full task ID
 * @param depIdFragment Raw dep ID (will be resolved)
 */
function cmdDepRemove(db: Vault0Database, resolvedTaskId: string, depIdFragment: string, format: OutputFormat): CommandResult {
  const resolvedDepId = resolveTaskId(db, depIdFragment)

  removeDependency(db, resolvedTaskId, resolvedDepId)

  if (format === "json") {
    return { success: true, message: jsonOutput({ taskId: resolvedTaskId, removed: resolvedDepId }), data: true }
  }

  return {
    success: true,
    message: formatSuccess(`Dependency removed: [${resolvedTaskId.slice(-8)}] no longer depends on [${resolvedDepId.slice(-8)}]`),
  }
}

/**
 * Internal: List dependencies (used by cmdEdit --dep-list)
 * @param resolvedId Already-resolved full task ID
 */
function cmdDepList(db: Vault0Database, resolvedId: string, format: OutputFormat): CommandResult {
  const detail = getTaskDetail(db, resolvedId)

  const result = {
    taskId: resolvedId,
    title: detail.title,
    dependsOn: detail.dependsOn.map((t) => ({ id: t.id, title: t.title, status: t.status })),
    dependedOnBy: detail.dependedOnBy.map((t) => ({ id: t.id, title: t.title, status: t.status })),
  }

  if (format === "json") {
    return { success: true, message: jsonOutput(result), data: result }
  }

  const lines: string[] = []
  lines.push(`Dependencies for: [${resolvedId.slice(-8)}] ${detail.title}`)
  lines.push("")

  if (detail.dependsOn.length > 0) {
    lines.push("Depends on:")
    for (const d of detail.dependsOn) {
      const done = d.status === "done" || d.status === "in_review" ? "✓" : "○"
      lines.push(`  ${done} [${d.id.slice(-8)}] ${d.title} (${d.status})`)
    }
  } else {
    lines.push("Depends on: (none)")
  }

  lines.push("")

  if (detail.dependedOnBy.length > 0) {
    lines.push("Blocking:")
    for (const d of detail.dependedOnBy) {
      lines.push(`  [${d.id.slice(-8)}] ${d.title} (${d.status})`)
    }
  } else {
    lines.push("Blocking: (none)")
  }

  return { success: true, message: lines.join("\n"), data: result }
}

/**
 * vault0 task subtasks <ID> [--ready]
 */
export function cmdSubtasks(db: Vault0Database, taskId: string, flags: Record<string, string>, format: OutputFormat): CommandResult {
  if (!taskId) {
    return { success: false, message: formatError("Task ID is required. Usage: vault0 task subtasks <ID> [--ready]") }
  }

  const resolvedId = resolveTaskId(db, taskId)
  const boardId = getDefaultBoardId(db)
  const allCards = getTaskCards(db, boardId)

  let subtasks = allCards.filter((c) => c.parentId === resolvedId)

  if (flags.ready === "true" || flags.ready === "") {
    subtasks = subtasks.filter((c) => c.isReady)
  }

  if (format === "json") {
    return { success: true, message: jsonOutput(subtasks), data: subtasks }
  }

  if (subtasks.length === 0) {
    const label = flags.ready !== undefined ? "No ready subtasks found." : "No subtasks found."
    return { success: true, message: label }
  }

  return { success: true, message: formatTaskList(subtasks), data: subtasks }
}

/**
 * vault0 board list
 */
export function cmdBoardList(db: Vault0Database, format: OutputFormat): CommandResult {
  const allBoards = getBoards(db)

  if (format === "json") {
    return { success: true, message: jsonOutput(allBoards), data: allBoards }
  }

  if (allBoards.length === 0) {
    return { success: true, message: "No boards found." }
  }

  const lines = allBoards.map(formatBoard)
  return { success: true, message: lines.join("\n"), data: allBoards }
}
