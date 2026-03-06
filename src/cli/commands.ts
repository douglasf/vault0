import { writeFileSync, existsSync, readFileSync } from "node:fs"
import type { Vault0Database } from "../db/connection.js"
import type { Status, Priority, Source, TaskType, ExportedTask, TaskExportEnvelope, BoardExportEnvelope } from "../lib/types.js"
import { parseTags } from "../lib/tags.js"
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
  importTasks,
  importBoard,
  exportBoard,
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
    .where(sql`${tasks.id} LIKE ${`%${idFragment.replace(/[%_]/g, "\\$&")}`} ESCAPE '\\'`)
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
    const tagList = parseTags(flags.tags)
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

  const updates: Partial<{ title: string; description: string; priority: "critical" | "high" | "normal" | "low"; type: "feature" | "bug" | "analysis" | null; tags: string[]; solution: string | null }> = {}

  if (flags.title) updates.title = flags.title
  if (flags.description !== undefined) updates.description = flags.description
  if (flags.priority) updates.priority = validatePriority(flags.priority)
  if (flags.type !== undefined) {
    updates.type = flags.type ? validateTaskType(flags.type) : null
  }
  if (flags.tags !== undefined) {
    updates.tags = parseTags(flags.tags)
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
 * vault0 task export [--task-id X] [--include-subtasks] [--format json|markdown] [--out file]
 */
export function cmdTaskExport(db: Vault0Database, flags: Record<string, string>, format: OutputFormat): CommandResult {
  const exportFormat = flags["export-format"] === "markdown" ? "markdown" : "json"
  const includeSubtasks = flags["include-subtasks"] === "true" || flags["include-subtasks"] === ""
  const outFile = flags.out

  // Collect tasks to export
  let taskRows: typeof tasks.$inferSelect[]

  if (flags["task-id"]) {
    const ids = flags["task-id"].split(",").map((id) => id.trim()).filter(Boolean)
    taskRows = ids.map((idFragment) => {
      const resolvedId = resolveTaskId(db, idFragment)
      const task = db.select().from(tasks).where(eq(tasks.id, resolvedId)).get()
      if (!task) throw new Error(`Task ${resolvedId} not found`)
      return task
    })
  } else {
    // Export all non-archived tasks on default board
    const boardId = getDefaultBoardId(db)
    taskRows = db
      .select()
      .from(tasks)
      .where(sql`${tasks.boardId} = ${boardId} AND ${tasks.archivedAt} IS NULL AND ${tasks.parentId} IS NULL`)
      .all()
  }

  // Build exported tasks
  const exportedTasks: ExportedTask[] = taskRows.map((t) => toExportedTask(db, t, includeSubtasks))

  if (exportFormat === "markdown") {
    const md = renderMarkdown(exportedTasks)
    if (outFile) {
      writeFileSync(outFile, md)
      return { success: true, message: formatSuccess(`Exported ${exportedTasks.length} task(s) to ${outFile}`) }
    }
    return { success: true, message: md, data: exportedTasks }
  }

  // JSON format
  const envelope: TaskExportEnvelope = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: exportedTasks,
  }

  const json = JSON.stringify(envelope, null, 2)
  if (outFile) {
    writeFileSync(outFile, json)
    return { success: true, message: formatSuccess(`Exported ${exportedTasks.length} task(s) to ${outFile}`) }
  }
  return { success: true, message: json, data: envelope }
}

/** Convert a DB task row to an ExportedTask, optionally including subtasks */
function toExportedTask(
  db: Vault0Database,
  t: typeof tasks.$inferSelect,
  includeSubtasks: boolean,
): ExportedTask {
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

  if (includeSubtasks) {
    const children = db
      .select()
      .from(tasks)
      .where(sql`${tasks.parentId} = ${t.id} AND ${tasks.archivedAt} IS NULL`)
      .all()
    if (children.length > 0) {
      exported.subtasks = children.map((c) => toExportedTask(db, c, false))
    }
  }

  return exported
}

/** Render exported tasks as Markdown */
function renderMarkdown(exportedTasks: ExportedTask[]): string {
  const lines: string[] = []

  for (const task of exportedTasks) {
    lines.push(`# ${task.title}`)
    lines.push("")
    if (task.description) {
      lines.push(task.description)
      lines.push("")
    }
    if (task.solution) {
      lines.push("**Solution:**")
      lines.push("")
      lines.push(task.solution)
      lines.push("")
    }

    if (task.subtasks && task.subtasks.length > 0) {
      for (const sub of task.subtasks) {
        lines.push(`## ${sub.title}`)
        lines.push("")
        if (sub.description) {
          lines.push(sub.description)
          lines.push("")
        }
        if (sub.solution) {
          lines.push("**Solution:**")
          lines.push("")
          lines.push(sub.solution)
          lines.push("")
        }
      }
    }
  }

  return `${lines.join("\n").trimEnd()}\n`
}

/**
 * vault0 task import <FILE>
 * Import tasks from a JSON file (TaskExportEnvelope or raw ExportedTask array).
 */
export function cmdTaskImport(db: Vault0Database, filePath: string, flags: Record<string, string>, format: OutputFormat): CommandResult {
  if (!filePath) {
    return { success: false, message: formatError("FILE argument is required. Usage: vault0 task import <FILE>") }
  }

  if (!existsSync(filePath)) {
    return { success: false, message: formatError(`File not found: ${filePath}`) }
  }

  let raw: string
  try {
    raw = readFileSync(filePath, "utf-8")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, message: formatError(`Failed to read file: ${msg}`) }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { success: false, message: formatError("File is not valid JSON") }
  }

  // Determine if it's an envelope or a raw array
  let exportedTasks: ExportedTask[]
  let exportedDeps: { taskId: string; dependsOn: string }[] | undefined

  if (Array.isArray(parsed)) {
    // Raw array of tasks
    exportedTasks = parsed as ExportedTask[]
  } else if (parsed && typeof parsed === "object" && "tasks" in parsed && Array.isArray((parsed as TaskExportEnvelope).tasks)) {
    // Envelope format
    const envelope = parsed as TaskExportEnvelope
    exportedTasks = envelope.tasks
    exportedDeps = envelope.dependencies
  } else {
    return { success: false, message: formatError("Invalid import format. Expected a TaskExportEnvelope or an array of tasks.") }
  }

  if (exportedTasks.length === 0) {
    return { success: false, message: formatError("No tasks found in import file") }
  }

  // Validate each task has at minimum an id and title
  for (const t of exportedTasks) {
    if (!t.id || !t.title) {
      return { success: false, message: formatError("Each task must have an 'id' and 'title' field") }
    }
  }

  const boardId = flags.board || getDefaultBoardId(db)

  try {
    const result = importTasks(db, boardId, exportedTasks, exportedDeps)

    if (format === "json") {
      const data = {
        taskCount: result.taskCount,
        dependencyCount: result.dependencyCount,
        idMap: Object.fromEntries(result.idMap),
      }
      return { success: true, message: jsonOutput(data), data }
    }

    let msg = formatSuccess(`Imported ${result.taskCount} task(s)`)
    if (result.dependencyCount > 0) {
      msg += `\n${formatSuccess(`Imported ${result.dependencyCount} dependency(ies)`)}`
    }
    return { success: true, message: msg, data: result }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, message: formatError(`Import failed: ${msg}`) }
  }
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

// ── Board Export ────────────────────────────────────────────────────

export function cmdBoardExport(db: Vault0Database, flags: Record<string, string>, format: OutputFormat): CommandResult {
  const boardId = flags.board || getDefaultBoardId(db)
  const outFile = flags.out

  const envelope = exportBoard(db, boardId)

  const json = JSON.stringify(envelope, null, 2)
  if (outFile) {
    writeFileSync(outFile, json)
    return { success: true, message: formatSuccess(`Exported board to ${outFile} (${envelope.tasks.length} task(s))`), data: envelope }
  }
  return { success: true, message: json, data: envelope }
}

// ── Board Import ────────────────────────────────────────────────────

/**
 * vault0 board import <FILE>
 * Import a board from a BoardExportEnvelope JSON file.
 */
export function cmdBoardImport(db: Vault0Database, filePath: string, flags: Record<string, string>, format: OutputFormat): CommandResult {
  if (!filePath) {
    return { success: false, message: formatError("FILE argument is required. Usage: vault0 board import <FILE>") }
  }

  if (!existsSync(filePath)) {
    return { success: false, message: formatError(`File not found: ${filePath}`) }
  }

  let raw: string
  try {
    raw = readFileSync(filePath, "utf-8")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, message: formatError(`Failed to read file: ${msg}`) }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { success: false, message: formatError("File is not valid JSON") }
  }

  // Validate BoardExportEnvelope structure
  if (!parsed || typeof parsed !== "object" || !("version" in parsed) || !("board" in parsed) || !("tasks" in parsed)) {
    return { success: false, message: formatError("Invalid format. Expected a BoardExportEnvelope with version, board, and tasks fields.") }
  }

  const envelope = parsed as BoardExportEnvelope

  if (envelope.version !== 1) {
    return { success: false, message: formatError(`Unsupported envelope version: ${envelope.version}. Expected version 1.`) }
  }

  if (!Array.isArray(envelope.tasks)) {
    return { success: false, message: formatError("Invalid format. 'tasks' must be an array.") }
  }

  // Validate each task has at minimum an id and title
  for (const t of envelope.tasks) {
    if (!t.id || !t.title) {
      return { success: false, message: formatError("Each task must have an 'id' and 'title' field") }
    }
  }

  const boardId = flags.board || getDefaultBoardId(db)

  try {
    const result = importBoard(db, boardId, envelope)

    if (format === "json") {
      const data = {
        taskCount: result.taskCount,
        dependencyCount: result.dependencyCount,
        idMap: Object.fromEntries(result.idMap),
      }
      return { success: true, message: jsonOutput(data), data }
    }

    let msg = formatSuccess(`Imported ${result.taskCount} task(s) from board "${envelope.board.name}"`)
    if (result.dependencyCount > 0) {
      msg += `\n${formatSuccess(`Imported ${result.dependencyCount} dependency(ies)`)}`
    }
    return { success: true, message: msg, data: result }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, message: formatError(`Import failed: ${msg}`) }
  }
}
