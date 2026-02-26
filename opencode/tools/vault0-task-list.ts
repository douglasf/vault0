import { tool } from "@opencode-ai/plugin"
import { runVault0 } from "../lib/vault0-utils"

export default tool({
  description:
    "List tasks from vault0 with optional filters. " +
    "Returns top-level task cards with enrichment (blocked/ready status, subtask counts). " +
    "Use vault0-task-view to see subtasks and full details for a specific task.",
  args: {
    status: tool.schema
      .enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"])
      .optional()
      .describe("Filter by task status"),
    priority: tool.schema
      .enum(["critical", "high", "normal", "low"])
      .optional()
      .describe("Filter by priority level"),
    search: tool.schema
      .string()
      .optional()
      .describe("Search in task title and description"),
    blocked: tool.schema
      .boolean()
      .optional()
      .describe(
        "Filter by blocked status. true = only blocked tasks (have unsatisfied dependencies). " +
          "false or omitted = no filter applied (returns all tasks regardless of blocked status)."
      ),
    ready: tool.schema
      .boolean()
      .optional()
      .describe(
        "Filter by ready status. true = only ready tasks (unblocked and not done). " +
          "false or omitted = no filter applied (returns all tasks regardless of ready status)."
      ),
  },
  async execute(args, context): Promise<string> {
    context.metadata({ title: "Listing vault0 tasks" })

    // Build CLI arguments
    const cliArgs = ["task", "list"]
    if (args.status) cliArgs.push("--status", args.status)
    if (args.priority) cliArgs.push("--priority", args.priority)
    if (args.search) cliArgs.push("--search", args.search)
    if (args.blocked) cliArgs.push("--blocked")
    if (args.ready) cliArgs.push("--ready")

    const result = runVault0(cliArgs, context)
    if (!result.success) {
      return JSON.stringify({ error: result.error })
    }
    return JSON.stringify(result.data)
  },
})
