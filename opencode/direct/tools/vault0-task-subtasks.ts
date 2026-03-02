import { tool } from "@opencode-ai/plugin"
import { runVault0 } from "../lib/vault0-utils"

export default tool({
  description:
    "List subtasks of a vault0 task. " +
    "Returns subtasks with status, blocked/ready flags, and dependency info. " +
    "Use --ready to filter to only actionable (unblocked, not done) subtasks. " +
    "Useful for selecting tasks to run in parallel.",
  args: {
    id: tool.schema
      .string()
      .describe("Parent task ID (full ULID or unique suffix match)"),
    ready: tool.schema
      .boolean()
      .optional()
      .describe(
        "Filter to only ready subtasks (unblocked and not done). " +
          "Useful for finding parallelizable work."
      ),
  },
  async execute(args, context): Promise<string> {
    context.metadata({
      title: args.ready
        ? `Ready subtasks of ${args.id}`
        : `Subtasks of ${args.id}`,
    })

    const cliArgs = ["task", "subtasks", args.id]
    if (args.ready) cliArgs.push("--ready")

    const result = runVault0(cliArgs, context)
    if (!result.success) {
      return JSON.stringify({ error: result.error })
    }
    return JSON.stringify(result.data)
  },
})
