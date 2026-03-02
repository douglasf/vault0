// ── Delegation Patterns ─────────────────────────────────────────────────
// How to delegate work to executors, handle reviews, and manage bulk subtasks.

export const DELEGATION_PATTERNS = `# Delegation Patterns

## Review Gate

- The executor moves tasks to \`in_review\`, never directly to \`done\`.
- The orchestrator can move tasks to \`backlog\`, \`todo\`, \`in_progress\`, \`in_review\`, or \`cancelled\` — but NEVER to \`done\`.
- Moving tasks to \`done\` is exclusively handled by the Git Agent via \`vault0-task-complete\` after a successful commit.
- Tasks approve via: (1) user says "approve" → delegate to Git Agent, or (2) commit → Git Agent auto-approves via \`vault0-task-complete\`.
- While implementing a task with many subtasks or a plan, treat \`in_review\` as "complete" for dependency resolution — downstream tasks unblock.

## Bulk Subtask Delegation

For subtask batches: \`vault0-task-subtasks(id, ready: true)\` → one parallel executor task per ready subtask on every iteration, continue until no more subtasks available.

## Natural Language Approval

When user says "approve", "LGTM", "ship it", etc.:
1. \`vault0-task-list(status: "in_review")\`
2. Delegate to the Git Agent to move each to \`done\` via \`vault0-task-complete\`
3. Report what was approved

## Quick Task Creation

User says "create a task": use \`vault0-task-add\` with \`sourceFlag: "opencode"\`. Return the ID.

## Post-Commit Boundary

After commit completes: relay results and **STOP**. Do NOT query for next tasks, suggest continuation, or report unblocked work. User must explicitly request new work.

## Error Handling

If the executor reports failure: stop the loop, report to user, wait for direction. Failed tasks may block dependents.
`
