// ── Task Delegation ─────────────────────────────────────────────────────
// Workflow for agents that discover tasks and delegate them to other agents.

export const TASK_DELEGATION = `# Task Delegation

> **Applies if**: you have \`vault0_task-list\`, \`vault0_task-subtasks\`, and \`vault0_task-move\` in your tools, AND you delegate work to other agents.

## Delegation Loop

Only runs when the user explicitly asks to implement tasks (e.g., "implement <ULID>", "work through the tasks"). Does NOT auto-start after commits or approvals.

**IMPORTANT**: If the instruction is to implement something with many steps (task with subtasks, or a plan), CONTINUE UNTIL THERE ARE NO MORE TASKS THAT SATISFY THE INITIAL REQUEST.

1. **Discover**: Fresh query every iteration. Never reuse prior results.
   - If user provided a ULID: \`vault0_task-subtasks(id, ready: true)\`
   - Otherwise: \`vault0_task-list(ready: true)\`
2. **Pick**: Highest priority first — critical → high → normal → low. Same priority: first returned.
3. **Delegate**: One agent call per task, parallelize where possible.
   - **ALWAYS include the task ID** in the delegation prompt so the receiving agent can claim it. Use: \`Task ID: <full-ULID>\` at the top.
   - Include the task description/requirements in the prompt body.
4. **Repeat**: Fresh \`vault0_task-list(ready: true)\` or \`vault0_task-subtasks(id, ready: true)\` after each delegation round completes. Continue until none ready.

## Parent Promotion

When \`vault0_task-subtasks(id, ready: true)\` returns empty for a parent task, move the parent to \`in_review\` via \`vault0_task-move\`.

## Assignment Rules

- Only delegate tasks that are **ready** and in \`backlog\`/\`todo\`.
- Skip \`in_progress\`, \`in_review\`, \`done\`, \`cancelled\`.

## Status Boundaries

- You may move tasks to \`backlog\`, \`todo\`, \`in_progress\`, \`in_review\`, or \`cancelled\`.
- You may NEVER move tasks to \`done\`. Only \`vault0_task-complete\` does that — and only if you have it.
- Treat \`in_review\` as "complete" for dependency resolution — downstream tasks unblock.

## Natural Language Approval

When user says "approve", "LGTM", "ship it", etc.:
1. \`vault0_task-list(status: "in_review")\`
2. If you have \`vault0_task-complete\`: complete them directly.
3. If you don't: delegate to an agent that does.

## Quick Task Creation

User says "create a task": use \`vault0_task-add\` (if available) with \`sourceFlag: "opencode"\`. Return the ID.

## Post-Commit Boundary

After a commit completes: relay results and **STOP**. Do NOT query for next tasks, suggest continuation, or report unblocked work. User must explicitly request new work.

## Error Handling

If a delegated agent reports failure: stop the loop, report to user, wait for direction. Failed tasks may block dependents.

## Completion

When \`vault0_task-list(ready: true)\` returns empty: either all done (summarize) or remaining blocked (report what's waiting on what).
`
