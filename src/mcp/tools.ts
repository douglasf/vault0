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
 * Register all 14 vault0 task management tool variants on the MCP server.
 *
 * Each base tool has agent-specific variants with rich descriptions containing
 * behavioral guidance, plus a generic fallback. All variants share identical
 * schemas and handlers — only the name and description differ.
 */
export function registerTools(server: McpServer, db: Vault0Database, sqlite?: Database): void {
  /** Run WAL checkpoint after write if sqlite handle available */
  const checkpoint = () => { if (sqlite) walCheckpoint(sqlite) }
  // ── 1. task-view (universal) ────────────────────────────────────────
  server.tool(
    "task-view",
    "When a ULID appears, call this to resolve it — ULIDs always refer to vault0 tasks. Results are snapshots, not live views. Always query fresh: call task-view before mutating any task. On error, stop and report to orchestrator. **IMPORTANT CRITICAL** When you delegate implementation of this task to a subagent it is CRITICAL that you include the task id in the delegation prompt",
    viewSchema,
    (args) => withErrorHandling(() => cmdView(db, args.id, "json")),
  )

  // ── 2. task-add-planner (Architect, Marsellus) ──────────────────────
  server.tool(
    "task-add-planner",
    "Create parent task first, then subtasks sequentially — parent MUST exist before children. Subtasks cannot have children (one level only). Set sourceFlag to indicate provenance: 'opencode' for user-requested, 'opencode-plan' for agent-decomposed plans. All task state must live in vault0 — never track in markdown. On error, stop and report.",
    addSchema,
    (args) => { const r = handleAdd(db, args); checkpoint(); return r },
  )

  // ── 3. task-add (generic) ──────────────────────────────────────────
  server.tool(
    "task-add",
    "Create a new task. Set sourceFlag for provenance tracking. Supports parent-child hierarchies (use parent ID for subtasks). On error, stop and report.",
    addSchema,
    (args) => { const r = handleAdd(db, args); checkpoint(); return r },
  )

  // ── 4. task-move-executor (Wolf) ───────────────────────────────────
  server.tool(
    "task-move-executor",
    "Move to in_progress immediately when you begin work — do not start while task is still in todo. When implementation is complete, move to in_review with a solution note — NEVER directly to done. Execute one task then stop. Always call task-view first to verify current status. Valid targets: backlog, todo, in_progress, in_review, cancelled. Cannot move to done — only task-complete-git can do that. On error, stop and report.",
    moveSchema,
    (args) => { const r = handleMove(db, args.id, args); checkpoint(); return r },
  )

  // ── 5. task-move-orchestrator (Marsellus) ──────────────────────────
  server.tool(
    "task-move-orchestrator",
    "Move task through workflow: backlog → todo → in_progress → in_review. When all subtasks are done/cancelled, promote the parent from todo to in_review. Use solution field to record context about why you moved it. Always call task-view first to verify current status. Valid targets: backlog, todo, in_progress, in_review, cancelled. Cannot move to done. On error, stop and report.",
    moveSchema,
    (args) => { const r = handleMove(db, args.id, args); checkpoint(); return r },
  )

  // ── 6. task-move (generic) ─────────────────────────────────────────
  server.tool(
    "task-move",
    "Change task status. Always call task-view first. Valid targets: backlog, todo, in_progress, in_review, cancelled. Cannot move to done. On error, stop and report.",
    moveSchema,
    (args) => { const r = handleMove(db, args.id, args); checkpoint(); return r },
  )

  // ── 7. task-update-planner (Architect) ─────────────────────────────
  server.tool(
    "task-update-planner",
    "Update task metadata. Only add dependency edges (depAdd) for TRUE sequential constraints — not ordering preferences or grouping. Use solution field to record planning context. Always call task-view first. On error, stop and report.",
    updateSchema,
    (args) => { const r = handleUpdate(db, args.id, args); checkpoint(); return r },
  )

  // ── 8. task-update (generic) ───────────────────────────────────────
  server.tool(
    "task-update",
    "Update task metadata. Use solution field to record context. Always call task-view first. On error, stop and report.",
    updateSchema,
    (args) => { const r = handleUpdate(db, args.id, args); checkpoint(); return r },
  )

  // ── 9. task-complete-git (Git) ─────────────────────────────────────
  server.tool(
    "task-complete-git",
    "Mark task as done. After a successful commit, complete correlated in_review tasks with a solution referencing the commit. After completing, STOP immediately — do not pick next tasks. Always call task-view first. On error, stop and report.",
    completeSchema,
    (args) => { const r = handleComplete(db, args); checkpoint(); return r },
  )

  // ── 10. task-complete (generic) ────────────────────────────────────
  server.tool(
    "task-complete",
    "Mark task as done. Use solution field to record context. Always call task-view first. On error, stop and report.",
    completeSchema,
    (args) => { const r = handleComplete(db, args); checkpoint(); return r },
  )

  // ── 11. task-list-orchestrator (Marsellus) ─────────────────────────
  server.tool(
    "task-list-orchestrator",
    "Query tasks. Before delegating work, use ready: true to discover actionable (unblocked, non-done) tasks. Only delegate tasks that are unblocked and in todo status. Always include the full ULID (26-char Crockford Base32) in delegation prompts — never reference tasks by title alone. On error, stop and report.",
    listSchema,
    (args) => handleList(db, args),
  )

  // ── 12. task-list (generic) ────────────────────────────────────────
  server.tool(
    "task-list",
    "Query tasks with optional filters (status, priority, tags, ready). Returns matching tasks. On error, stop and report.",
    listSchema,
    (args) => handleList(db, args),
  )

  // ── 13. task-subtasks-orchestrator (Marsellus) ─────────────────────
  server.tool(
    "task-subtasks-orchestrator",
    "Get subtasks. Use ready: true to discover actionable subtasks before delegating. Only delegate ready, unblocked tasks. Always include full ULID in delegation prompts. After all subtasks are done/cancelled, query the parent and promote it to in_review. On error, stop and report.",
    subtasksSchema,
    (args) => handleSubtasks(db, args),
  )

  // ── 14. task-subtasks (generic) ────────────────────────────────────
  server.tool(
    "task-subtasks",
    "Get subtasks with optional ready filter. On error, stop and report.",
    subtasksSchema,
    (args) => handleSubtasks(db, args),
  )
}
