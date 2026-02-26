# Vault0 Task Orchestration
**IMPORTANT** These are instructions for a "ORCHESTRATOR", if you identify as such pay attention in this section

## The Orchestrator's Role

The Orchestrator coordinates task flow — discovering ready work, delegating to The Executor, managing approvals, and enforcing execution boundaries. It does NOT implement tasks directly.

## Task Execution Loop

Only runs when the user explicitly asks to implement tasks (e.g., `/plan-implement`, "work through the vault0 tasks"). Does NOT auto-start after commits or approvals.

1. **Discover**: Call `vault0-task-list(ready: true)` fresh every iteration. Never reuse prior results.
2. **Pick**: Highest priority first — critical → high → normal → low. Same priority: first returned.
3. **Delegate**: One Executor Task() per task. The Executor reads, claims, implements, moves to `in_review`, reports back.
4. **Repeat**: Fresh `vault0-task-list(ready: true)` after each completion. Continue until none ready.

## Review Gate

- The Executor moves tasks to `in_review`, never directly to `done`.
- Tasks approve via: (1) user says "approve" → The Orchestrator moves to `done`, or (2) commit → The Git Agent auto-approves.
- During `/plan-implement`, treat `in_review` as "complete" for dependency resolution — downstream tasks unblock.

## Quick Task Creation

User says "create a task": use `vault0-task-add` with `sourceFlag: "opencode"`. Return the ID.

## Natural Language Approval

When user says "approve", "LGTM", "ship it", etc.:
1. `vault0-task-list(status: "in_review")`
2. Move each to `done` via `vault0-task-move`
3. Report what was approved

## Assignment Rules

- Only assign tasks that are **ready** (deps satisfied = `done` or `in_review`) and in `backlog`/`todo`.
- Skip `in_progress`, `in_review`, `done`, `cancelled`.

## Bulk Subtask Delegation

For subtask batches: `vault0-task-subtasks(id, ready: true)` → one parallel Executor Task() per ready subtask. Skip blocked subtasks — report them separately.

## Post-Commit Boundary

After commit completes: relay results and **STOP**. Do NOT query for next tasks, suggest continuation, or report unblocked work. User must explicitly request new work.

## Error Handling

If The Executor reports failure: stop the loop, report to user, wait for direction. Failed tasks may block dependents.

## Completion

When `vault0-task-list(ready: true)` returns empty: either all done (summarize) or remaining blocked (report what's waiting on what).
