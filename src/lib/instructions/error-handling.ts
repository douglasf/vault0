// ── Error Handling ──────────────────────────────────────────────────────
// Error handling patterns across all roles.

export const ERROR_HANDLING = `# Error Handling

## Orchestrator Error Handling

If the executor reports failure: stop the loop, report to user, wait for direction. Failed tasks may block dependents.

## Executor Error Handling

- Guard-clause throws at function top with descriptive messages including entity IDs
- Empty catch with comment for non-fatal errors
- \`instanceof Error\` for type narrowing in catch blocks

## Planning Error Handling

If \`vault0-task-add\` fails:
1. Check the error message — network issue, permission issue, malformed input, or vault0 unavailable?
2. Retry once with corrected input
3. If it still fails AND vault0 is confirmed unavailable → STOP and error to the user

Do NOT fall back to markdown plans. Planning failure is acceptable — a clear error is better than a hidden workaround.

## State Verification

Tool outputs are snapshots, not live views. Always call \`vault0-task-view\` fresh before starting work — the task may have been edited, cancelled, or reassigned since you last saw it.

## Task Failure Cascade

When a task fails:
- It may block dependent tasks
- Report the failure clearly with context
- Wait for user direction before retrying or moving on
- Do NOT automatically retry without understanding the root cause
`
