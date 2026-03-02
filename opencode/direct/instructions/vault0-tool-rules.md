# Vault0 Tool Reference

> If you have ANY vault0 tools in your config, read this block.

**IMPORTANT** vault0 uses ULIDs to identify its tasks. When the user mentions a ULID, assume they mean a vault0 task.

## Tools

| Tool | Purpose | Key constraints |
|------|---------|-----------------|
| `vault0-task-add` | Create new tasks only | Never use to modify existing tasks. Accepts `parent` for subtasks, `sourceFlag` for provenance. |
| `vault0-task-list` | Query tasks with filters | Params: `status`, `priority`, `search`, `blocked`, `ready`. Returns top-level cards. |
| `vault0-task-view` | Full details for one task | Returns subtasks, dependencies, status history. Always query fresh before acting. |
| `vault0-task-update` | Edit metadata only | Title, description, priority, tags, type, solution, dependencies (`depAdd`/`depRemove`). Does NOT change status. |
| `vault0-task-move` | Status transitions only | Valid targets: `backlog`, `todo`, `in_progress`, `in_review`, `cancelled`. **Cannot move to `done`** — use `vault0-task-complete`. |
| `vault0-task-complete` | Move a task to `done` | The ONLY way to mark a task done. Accepts `id` and optional `solution`. |
| `vault0-task-subtasks` | List subtasks of a parent | Use `ready: true` to get only unblocked, not-done subtasks. |

## Valid Values

- **Priority**: `"critical"`, `"high"`, `"normal"`, `"low"`
- **Status**: `"backlog"`, `"todo"`, `"in_progress"`, `"in_review"`, `"done"`, `"cancelled"`
- **Type**: `"feature"`, `"bug"`, `"analysis"`
- **Source**: `"opencode"` (ad-hoc), `"opencode-plan"` (plan-created)

## Stale State Rule

Tool outputs are snapshots, not live views. Always query fresh before acting — never rely on cached results from earlier in the conversation.

## Hierarchy

- vault0 supports one level of nesting: parent → subtasks.
- Do NOT create a subtask of a subtask.
- A task is **ready** when all its dependencies are `done` or `in_review`, and its status is `backlog` or `todo`.
