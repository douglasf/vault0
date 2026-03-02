import { tool } from "@opencode-ai/plugin"
import { runVault0 } from "../lib/vault0-utils"

export default tool({
  description:
    "Create a new task or subtask in vault0. " +
    "Returns the created task as JSON.",
  args: {
    title: tool.schema
      .string()
      .describe("Task title (concise and descriptive)"),
    description: tool.schema
      .string()
      .optional()
      .describe("Task description or acceptance criteria"),
    priority: tool.schema
      .enum(["critical", "high", "normal", "low"])
      .optional()
      .describe("Priority level (default: normal)"),
    status: tool.schema
      .enum(["backlog", "todo", "in_progress", "in_review", "done"])
      .optional()
      .describe("Initial status (default: backlog)"),
    parent: tool.schema
      .string()
      .optional()
      .describe("Parent task ID for creating subtasks"),
    type: tool.schema
      .enum(["feature", "bug", "analysis"])
      .optional()
      .describe("Task type"),
    tags: tool.schema
      .string()
      .optional()
      .describe("Comma-separated tags for metadata (component names, area labels, etc.)"),
    sourceFlag: tool.schema
      .enum(["opencode", "opencode-plan"])
      .optional()
      .describe(
        "Vault0 native --source field. Use 'opencode-plan' for plan-created tasks, " +
          "'opencode' for ad-hoc tasks."
      ),
    sourceRefFlag: tool.schema
      .string()
      .optional()
      .describe(
        "Vault0 native --source-ref field. Reference to an external plan or document."
      ),
  },
  async execute(args, context): Promise<string> {
    context.metadata({ title: `Creating task: ${args.title}` })

    // Build CLI arguments
    const cliArgs = ["task", "add", "--title", args.title]
    if (args.description) cliArgs.push("--description", args.description)
    if (args.priority) cliArgs.push("--priority", args.priority)
    if (args.status) cliArgs.push("--status", args.status)
    if (args.parent) cliArgs.push("--parent", args.parent)
    if (args.type) cliArgs.push("--type", args.type)
    if (args.tags) cliArgs.push("--tags", args.tags)
    if (args.sourceFlag) cliArgs.push("--source", args.sourceFlag)
    if (args.sourceRefFlag) cliArgs.push("--source-ref", args.sourceRefFlag)

    const result = runVault0(cliArgs, context)
    if (!result.success) {
      return JSON.stringify({ error: result.error })
    }
    return JSON.stringify(result.data)
  },
})
