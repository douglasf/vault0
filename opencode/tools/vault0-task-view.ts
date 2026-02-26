import { tool } from "@opencode-ai/plugin"
import { runVault0 } from "../lib/vault0-utils"

export default tool({
  description:
    "Get full details of a single vault0 task by ID (full ULID or suffix match). " +
    "Returns subtasks, dependencies (both directions), and status history. " +
    "Use this after vault0-task-list to drill into a specific task.",
  args: {
    id: tool.schema
      .string()
      .describe("Task ID (full ULID or unique suffix match)"),
  },
  async execute(args, context): Promise<string> {
    context.metadata({ title: `Viewing task: ${args.id}` })

    const cliArgs = ["task", "view", args.id]

    const result = runVault0(cliArgs, context)
    if (!result.success) {
      return JSON.stringify({ error: result.error })
    }
    return JSON.stringify(result.data)
  },
})
