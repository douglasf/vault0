// ── Tool Reference ──────────────────────────────────────────────────────
// Pure reference for all vault0 task tools. Shared by any agent with vault0 access.

export const TOOL_REFERENCE = `# Vault0 Tool Reference

> If you have ANY vault0 tools in your config, read this block.

vault0 uses ULIDs to identify tasks. When the user mentions a ULID, assume they mean a vault0 task.

## Tools

| Tool | Purpose | Key constraints |
|------|---------|-----------------|
| \`vault0_task-add\` | Create new tasks only | Never use to modify existing tasks. Accepts \`parent\` for subtasks, \`sourceFlag\` for provenance. |
| \`vault0_task-list\` | Query tasks with filters | Params: \`status\`, \`priority\`, \`search\`, \`blocked\`, \`ready\`. Returns top-level cards. |
| \`vault0_task-view\` | Full details for one task | Returns subtasks, dependencies, status history. Always query fresh before acting. |
| \`vault0_task-update\` | Edit metadata only | Title, description, priority, tags, type, solution, dependencies (\`depAdd\`/\`depRemove\`). Does NOT change status. |
| \`vault0_task-move\` | Status transitions only | Valid targets: \`backlog\`, \`todo\`, \`in_progress\`, \`in_review\`, \`cancelled\`. **Cannot move to \`done\`** — use \`vault0_task-complete\`. |
| \`vault0_task-complete\` | Move a task to \`done\` | The ONLY way to mark a task done. Accepts \`id\` and optional \`solution\`. |
| \`vault0_task-subtasks\` | List subtasks of a parent | Use \`ready: true\` to get only unblocked, not-done subtasks. |

## Valid Values

- **Priority**: \`"critical"\`, \`"high"\`, \`"normal"\`, \`"low"\`
- **Status**: \`"backlog"\`, \`"todo"\`, \`"in_progress"\`, \`"in_review"\`, \`"done"\`, \`"cancelled"\`
- **Type**: \`"feature"\`, \`"bug"\`, \`"analysis"\`
- **Source**: \`"opencode"\` (ad-hoc), \`"opencode-plan"\` (plan-created)

## Stale State Rule

Tool outputs are snapshots, not live views. Always query fresh before acting — never rely on cached results from earlier in the conversation.

## Hierarchy

- vault0 supports one level of nesting: parent → subtasks.
- Do NOT create a subtask of a subtask.
- A task is **ready** when all its dependencies are \`done\` or \`in_review\`, and its status is \`backlog\` or \`todo\`.
`
