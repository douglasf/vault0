// ── Task Discovery ──────────────────────────────────────────────────────
// How to discover, query, and select tasks for execution.

export const TASK_DISCOVERY = `# Task Discovery

## Stale State Rule

Tool outputs are snapshots, not live views. Always query fresh before acting — never rely on cached results from earlier in the conversation.

## Discovery Methods

- **By ULID**: When the user provides a ULID, assume they're talking about a vault0 task. Use \`vault0-task-view(id)\` for full details.
- **By subtasks**: \`vault0-task-subtasks(id, ready: true)\` — returns unblocked, not-done subtasks only.
- **By status/priority**: \`vault0-task-list(status, priority, ready, blocked, search)\` — query with filters.

## Priority Order

When selecting from multiple ready tasks: critical → high → normal → low. Same priority: first returned.

## Readiness

A task is **ready** when:
- All dependencies are satisfied (\`done\` or \`in_review\`)
- Status is \`backlog\` or \`todo\`
- Not blocked by incomplete dependencies

## Valid Values

- **Priority**: \`"critical"\`, \`"high"\`, \`"normal"\`, \`"low"\`
- **Status**: \`"backlog"\`, \`"todo"\`, \`"in_progress"\`, \`"in_review"\`, \`"done"\`, \`"cancelled"\`
- **Type**: \`"feature"\`, \`"bug"\`, \`"analysis"\`
- **Source**: \`"opencode"\` (ad-hoc), \`"opencode-plan"\` (plan-created)
`
