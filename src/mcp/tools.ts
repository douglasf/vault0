import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
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

// ── Tool Registration ───────────────────────────────────────────────────

/**
 * Register all 7 vault0 task management tools on the MCP server.
 */
export function registerTools(server: McpServer, db: Vault0Database): void {
  // 1. task-list
  server.tool(
    "task-list",
    "List tasks from vault0 with optional filters. Returns top-level task cards with enrichment (blocked/ready status, subtask counts).",
    {
      status: z.enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]).optional().describe("Filter by status"),
      priority: z.enum(["critical", "high", "normal", "low"]).optional().describe("Filter by priority"),
      search: z.string().optional().describe("Search tasks by title or description"),
      blocked: z.boolean().optional().describe("Filter to blocked tasks only"),
      ready: z.boolean().optional().describe("Filter to ready (unblocked, actionable) tasks only"),
    },
    (args) => {
      const flags: Record<string, string> = {}
      if (args.status) flags.status = args.status
      if (args.priority) flags.priority = args.priority
      if (args.search) flags.search = args.search
      if (args.blocked) flags.blocked = "true"
      if (args.ready) flags.ready = "true"
      return withErrorHandling(() => cmdList(db, flags, "json"))
    },
  )

  // 2. task-add
  server.tool(
    "task-add",
    "Create a new task in vault0.",
    {
      title: z.string().describe("Task title (required)"),
      description: z.string().optional().describe("Task description"),
      priority: z.enum(["critical", "high", "normal", "low"]).optional().describe("Task priority"),
      status: z.enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]).optional().describe("Initial status"),
      parent: z.string().optional().describe("Parent task ID (for subtasks)"),
      sourceFlag: z.enum(["manual", "todo_md", "opencode", "opencode-plan", "import"]).optional().describe("Source flag"),
      type: z.enum(["feature", "bug", "analysis"]).optional().describe("Task type"),
      tags: z.string().optional().describe("Comma-separated tags"),
    },
    (args) => {
      const flags: Record<string, string> = { title: args.title }
      if (args.description) flags.description = args.description
      if (args.priority) flags.priority = args.priority
      if (args.status) flags.status = args.status
      if (args.parent) flags.parent = args.parent
      if (args.sourceFlag) flags.source = args.sourceFlag
      if (args.type) flags.type = args.type
      if (args.tags) flags.tags = args.tags
      return withErrorHandling(() => cmdAdd(db, flags, "json"))
    },
  )

  // 3. task-view
  server.tool(
    "task-view",
    "Get full details of a single vault0 task by ID. Returns subtasks, dependencies, and status history.",
    {
      id: z.string().describe("Task ID (full ULID or suffix match)"),
    },
    (args) => {
      return withErrorHandling(() => cmdView(db, args.id, "json"))
    },
  )

  // 4. task-move
  server.tool(
    "task-move",
    "Change a vault0 task's status. Cannot move to done — use task-complete for that.",
    {
      id: z.string().describe("Task ID (full ULID or suffix match)"),
      status: z.enum(["backlog", "todo", "in_progress", "in_review", "cancelled"]).describe("Target status"),
      solution: z.string().optional().describe("Optional solution notes"),
    },
    (args) => {
      const flags: Record<string, string> = { status: args.status }
      if (args.solution !== undefined) flags.solution = args.solution
      return withErrorHandling(() => cmdMove(db, args.id, flags, "json"))
    },
  )

  // 5. task-update
  server.tool(
    "task-update",
    "Update a task's metadata and dependencies. For status changes, use task-move instead.",
    {
      id: z.string().describe("Task ID (full ULID or suffix match)"),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
      priority: z.enum(["critical", "high", "normal", "low"]).optional().describe("New priority"),
      tags: z.string().optional().describe("Comma-separated tags (replaces existing)"),
      type: z.enum(["feature", "bug", "analysis"]).optional().describe("Task type"),
      solution: z.string().optional().describe("Solution notes"),
      depAdd: z.string().optional().describe("Add dependency on this task ID"),
      depRemove: z.string().optional().describe("Remove dependency on this task ID"),
    },
    (args) => {
      const flags: Record<string, string> = {}
      if (args.title) flags.title = args.title
      if (args.description !== undefined) flags.description = args.description
      if (args.priority) flags.priority = args.priority
      if (args.tags !== undefined) flags.tags = args.tags
      if (args.type) flags.type = args.type
      if (args.solution !== undefined) flags.solution = args.solution
      if (args.depAdd) flags["dep-add"] = args.depAdd
      if (args.depRemove) flags["dep-remove"] = args.depRemove
      return withErrorHandling(() => cmdEdit(db, args.id, flags, "json"))
    },
  )

  // 6. task-subtasks
  server.tool(
    "task-subtasks",
    "List subtasks of a vault0 task. Use ready filter to get only actionable subtasks.",
    {
      id: z.string().describe("Parent task ID (full ULID or suffix match)"),
      ready: z.boolean().optional().describe("Filter to only ready (unblocked, not done) subtasks"),
    },
    (args) => {
      const flags: Record<string, string> = {}
      if (args.ready) flags.ready = "true"
      return withErrorHandling(() => cmdSubtasks(db, args.id, flags, "json"))
    },
  )

  // 7. task-complete
  server.tool(
    "task-complete",
    "Move a task to done status. This is the exclusive mechanism for marking tasks complete.",
    {
      id: z.string().describe("Task ID (full ULID or suffix match)"),
      solution: z.string().optional().describe("Resolution summary or commit details"),
    },
    (args) => {
      const flags: Record<string, string> = { status: "done" }
      if (args.solution !== undefined) flags.solution = args.solution
      return withErrorHandling(() => cmdMove(db, args.id, flags, "json"))
    },
  )
}
