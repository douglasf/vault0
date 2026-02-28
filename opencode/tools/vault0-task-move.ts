import { tool } from "@opencode-ai/plugin"
import { runVault0 } from "../lib/vault0-utils"

export default tool({
  description:
    "Change a vault0 task's status. " +
    "Use this to move tasks through workflow stages (backlog → todo → in_progress → in_review). " +
    "Cannot move to done — use vault0-task-complete for that (git agent only). " +
    "For editing task metadata (title, description, priority, tags, dependencies), use vault0-task-update instead.",
  args: {
    id: tool.schema
      .string()
      .describe("Task ID (full ULID or unique suffix match)"),
    status: tool.schema
      .enum(["backlog", "todo", "in_progress", "in_review", "cancelled"])
      .describe("Target status (done is not allowed — use vault0-task-complete)"),
    solution: tool.schema
      .string()
      .optional()
      .describe("Solution notes (typically set when moving to done)"),
  },
  async execute(args, context): Promise<string> {
    context.metadata({
      title: `Moving task ${args.id} → ${args.status}`,
    })

    const cliArgs = ["task", "move", args.id, "--status", args.status]
    if (args.solution) cliArgs.push("--solution", args.solution)

    const result = runVault0(cliArgs, context)
    if (!result.success) {
      return JSON.stringify({ error: result.error })
    }
    return JSON.stringify(result.data)
  },
})
