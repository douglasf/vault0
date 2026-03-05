import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { Database } from "bun:sqlite"
import type { Vault0Database } from "../db/connection.js"
import {
  cmdList,
  cmdAdd,
  cmdView,
  cmdMove,
  cmdEdit,
  cmdSubtasks,
  type CommandResult,
} from "../cli/commands.js"

// ── Helpers ─────────────────────────────────────────────────────────────

/** Convert a CommandResult to MCP tool response format */
function toMcpResponse(result: CommandResult) {
  return {
    content: [
      {
        type: "text" as const,
        text: result.data ? JSON.stringify(result.data, null, 2) : result.message,
      },
    ],
    isError: !result.success,
  }
}

/** Wrap a handler with error catching */
function withErrorHandling(fn: () => CommandResult) {
  try {
    return toMcpResponse(fn())
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: "text" as const, text: message }],
      isError: true,
    }
  }
}

/**
 * Flush WAL to the main database file after a write operation.
 * This ensures the TUI's fs.watch detects the change immediately,
 * since it monitors the main .db file, not the WAL.
 */
function walCheckpoint(sqlite: Database) {
  try {
    sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  } catch { /* checkpoint is best-effort — safe to ignore */ }
}



// ── Shared Schemas ──────────────────────────────────────────────────────

const viewSchema = {
  id: z.string().describe("Task ID (full ULID or suffix match)"),
}

const listSchema = {
  status: z.enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]).optional().describe("Filter by status"),
  priority: z.enum(["critical", "high", "normal", "low"]).optional().describe("Filter by priority"),
  search: z.string().optional().describe("Search tasks by title or description"),
  blocked: z.boolean().optional().describe("Filter to blocked tasks only"),
  ready: z.boolean().optional().describe("Filter to ready (unblocked, actionable) tasks only"),
}

const addSchema = {
  title: z.string().describe("Task title (required)"),
  description: z.string().optional().describe("Task description"),
  priority: z.enum(["critical", "high", "normal", "low"]).optional().describe("Task priority"),
  status: z.enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]).optional().describe("Initial status"),
  parent: z.string().optional().describe("Parent task ID (for subtasks)"),
  sourceFlag: z.enum(["manual", "todo_md", "opencode", "opencode-plan", "import"]).optional().describe("Source flag"),
  type: z.enum(["feature", "bug", "analysis"]).optional().describe("Task type"),
  tags: z.string().optional().describe("Comma-separated tags"),
}

const moveSchema = {
  id: z.string().describe("Task ID (full ULID or suffix match)"),
  status: z.enum(["backlog", "todo", "in_progress", "in_review", "cancelled"]).describe("Target status"),
  solution: z.string().optional().describe("Optional solution notes"),
}

const updateSchema = {
  id: z.string().describe("Task ID (full ULID or suffix match)"),
  title: z.string().optional().describe("New title"),
  description: z.string().optional().describe("New description"),
  priority: z.enum(["critical", "high", "normal", "low"]).optional().describe("New priority"),
  tags: z.string().optional().describe("Comma-separated tags (replaces existing)"),
  type: z.enum(["feature", "bug", "analysis"]).optional().describe("Task type"),
  solution: z.string().optional().describe("Solution notes"),
  depAdd: z.string().optional().describe("Add dependency on this task ID"),
  depRemove: z.string().optional().describe("Remove dependency on this task ID"),
}

const completeSchema = {
  id: z.string().describe("Task ID (full ULID or suffix match)"),
  solution: z.string().optional().describe("Resolution summary or commit details"),
}

const subtasksSchema = {
  id: z.string().describe("Parent task ID (full ULID or suffix match)"),
  ready: z.boolean().optional().describe("Filter to only ready (unblocked, not done) subtasks"),
}

// ── Shared Handlers ─────────────────────────────────────────────────────

function handleList(db: Vault0Database, args: { status?: string, priority?: string, search?: string, blocked?: boolean, ready?: boolean }) {
  const flags: Record<string, string> = {}
  if (args.status) flags.status = args.status
  if (args.priority) flags.priority = args.priority
  if (args.search) flags.search = args.search
  if (args.blocked) flags.blocked = "true"
  if (args.ready) flags.ready = "true"
  return withErrorHandling(() => cmdList(db, flags, "json"))
}

function handleAdd(db: Vault0Database, args: { title: string, description?: string, priority?: string, status?: string, parent?: string, sourceFlag?: string, type?: string, tags?: string }) {
  const flags: Record<string, string> = { title: args.title }
  if (args.description) flags.description = args.description
  if (args.priority) flags.priority = args.priority
  if (args.status) flags.status = args.status
  if (args.parent) flags.parent = args.parent
  if (args.sourceFlag) flags.source = args.sourceFlag
  if (args.type) flags.type = args.type
  if (args.tags) flags.tags = args.tags
  return withErrorHandling(() => cmdAdd(db, flags, "json"))
}

function handleMove(db: Vault0Database, id: string, args: { status: string, solution?: string }) {
  const flags: Record<string, string> = { status: args.status }
  if (args.solution !== undefined) flags.solution = args.solution
  return withErrorHandling(() => cmdMove(db, id, flags, "json"))
}

function handleUpdate(db: Vault0Database, id: string, args: { title?: string, description?: string, priority?: string, tags?: string, type?: string, solution?: string, depAdd?: string, depRemove?: string }) {
  const flags: Record<string, string> = {}
  if (args.title) flags.title = args.title
  if (args.description !== undefined) flags.description = args.description
  if (args.priority) flags.priority = args.priority
  if (args.tags !== undefined) flags.tags = args.tags
  if (args.type) flags.type = args.type
  if (args.solution !== undefined) flags.solution = args.solution
  if (args.depAdd) flags["dep-add"] = args.depAdd
  if (args.depRemove) flags["dep-remove"] = args.depRemove
  return withErrorHandling(() => cmdEdit(db, id, flags, "json"))
}

function handleComplete(db: Vault0Database, args: { id: string, solution?: string }) {
  const flags: Record<string, string> = { status: "done" }
  if (args.solution !== undefined) flags.solution = args.solution
  return withErrorHandling(() => cmdMove(db, args.id, flags, "json"))
}

function handleSubtasks(db: Vault0Database, args: { id: string, ready?: boolean }) {
  const flags: Record<string, string> = {}
  if (args.ready) flags.ready = "true"
  return withErrorHandling(() => cmdSubtasks(db, args.id, flags, "json"))
}

// ── Tool Registration ───────────────────────────────────────────────────

/**
 * Register vault0 task management tools on the MCP server.
 */
export function registerTools(server: McpServer, db: Vault0Database, sqlite?: Database): void {
  /** Run WAL checkpoint after write if sqlite handle available */
  const checkpoint = () => { if (sqlite) walCheckpoint(sqlite) }

  server.tool(
    "task-view",
    "View task details by ID. Returns full task data including status, priority, description, dependencies, solution notes, and metadata.",
    viewSchema,
    (args) => withErrorHandling(() => cmdView(db, args.id, "json")),
  )

  server.tool(
    "task-add",
    "Create a new task. Supports parent-child hierarchies (use parent ID for subtasks). Set sourceFlag for provenance tracking.",
    addSchema,
    (args) => { const r = handleAdd(db, args); checkpoint(); return r },
  )

  server.tool(
    "task-move",
    "Change task status. Valid targets: backlog, todo, in_progress, in_review, cancelled. Use task-complete to move to done.",
    moveSchema,
    (args) => { const r = handleMove(db, args.id, args); checkpoint(); return r },
  )

  server.tool(
    "task-update",
    "Update task metadata including title, description, priority, tags, type, solution notes, and dependency edges.",
    updateSchema,
    (args) => { const r = handleUpdate(db, args.id, args); checkpoint(); return r },
  )

  server.tool(
    "task-complete",
    "Mark a task as done. Use the solution field to record resolution details.",
    completeSchema,
    (args) => { const r = handleComplete(db, args); checkpoint(); return r },
  )

  server.tool(
    "task-list",
    "Query tasks with optional filters for status, priority, search text, blocked state, and ready (unblocked, actionable) state.",
    listSchema,
    (args) => handleList(db, args),
  )

  server.tool(
    "task-subtasks",
    "Get subtasks for a parent task. Use ready filter to find only unblocked, actionable subtasks.",
    subtasksSchema,
    (args) => handleSubtasks(db, args),
  )
}
