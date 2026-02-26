import { tool } from "@opencode-ai/plugin"
import { runVault0 } from "../lib/vault0-utils"

export default tool({
  description:
    "Update a task's metadata and dependencies in vault0. " +
    "Use this for editing fields like title, description, priority, tags, type, solution, and dependencies. " +
    "For changing task status, use vault0-task-move instead. " +
    "At least one optional field must be provided.",
  args: {
    id: tool.schema
      .string()
      .describe("Task ID (full ULID or unique suffix match)"),
    title: tool.schema
      .string()
      .optional()
      .describe("New task title"),
    description: tool.schema
      .string()
      .optional()
      .describe("New task description"),
    priority: tool.schema
      .enum(["critical", "high", "normal", "low"])
      .optional()
      .describe("New priority level"),
    type: tool.schema
      .enum(["feature", "bug", "analysis"])
      .optional()
      .describe("New task type (or empty string to clear)"),
    tags: tool.schema
      .string()
      .optional()
      .describe("New tags (comma-separated, replaces all existing tags)"),
    solution: tool.schema
      .string()
      .optional()
      .describe("Solution notes (or empty string to clear)"),
    depAdd: tool.schema
      .string()
      .optional()
      .describe("Add dependency on target task ID (this task will depend on the target)"),
    depRemove: tool.schema
      .string()
      .optional()
      .describe("Remove dependency on target task ID"),
  },
  async execute(args, context): Promise<string> {
    const hasFields = !!(
      args.title ||
      args.description ||
      args.priority ||
      args.type !== undefined ||
      args.tags ||
      args.solution !== undefined ||
      args.depAdd ||
      args.depRemove
    )

    if (!hasFields) {
      return JSON.stringify({ error: "No fields to update" })
    }

    context.metadata({ title: `Editing task ${args.id}` })

    const cliArgs = ["task", "edit", args.id]
    if (args.title) cliArgs.push("--title", args.title)
    if (args.description) cliArgs.push("--description", args.description)
    if (args.priority) cliArgs.push("--priority", args.priority)
    if (args.type !== undefined) cliArgs.push("--type", args.type)
    if (args.tags) cliArgs.push("--tags", args.tags)
    if (args.solution !== undefined) cliArgs.push("--solution", args.solution)
    if (args.depAdd) cliArgs.push("--dep-add", args.depAdd)
    if (args.depRemove) cliArgs.push("--dep-remove", args.depRemove)

    const result = runVault0(cliArgs, context)
    if (!result.success) {
      return JSON.stringify({ error: result.error })
    }
    return JSON.stringify(result.data)
  },
})
