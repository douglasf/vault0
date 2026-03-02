import { tool } from "@opencode-ai/plugin"
import { runVault0 } from "../lib/vault0-utils"

export default tool({
  description:
    "Move a vault0 task to done status. " +
    "This is the only way to mark a task as complete. " +
    "Restricted to the git agent for post-commit approval.",
  args: {
    id: tool.schema
      .string()
      .describe("Task ID (full ULID or unique suffix match)"),
    solution: tool.schema
      .string()
      .optional()
      .describe("Solution notes (e.g. commit details, resolution summary)"),
  },
  async execute(args, context): Promise<string> {
    context.metadata({
      title: `Completing task ${args.id} → done`,
    })

    const cliArgs = ["task", "move", args.id, "--status", "done"]
    if (args.solution) cliArgs.push("--solution", args.solution)

    const result = runVault0(cliArgs, context)
    if (!result.success) {
      return JSON.stringify({ error: result.error })
    }
    return JSON.stringify(result.data)
  },
})
