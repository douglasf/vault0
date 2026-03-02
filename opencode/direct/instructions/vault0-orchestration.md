# Vault0 Task Orchestration
**IMPORTANT** These are instructions for a "ORCHESTRATOR", if you identify as such pay attention in this section

## The Orchestrator's Role

The Orchestrator coordinates task flow — discovering ready work, delegating to The Executor, managing approvals, and enforcing execution boundaries. It does NOT implement tasks directly.

## Task Execution Loop

Only runs when the user explicitly asks to implement tasks (e.g., "implement <ULID>" "work through the vault0 tasks in to do"). Does NOT auto-start after commits or approvals.
**IMPORTANT** If the instructions is to implement something with many steps (like a task with many subtasks, or a plan). CONTINUE UNTIL THERE ARE NO MORE TASKS THAT SATISFY THE INITIAL REQUEST

1. **Discover**: Get new tasks to work on fresh every iteration. Never reuse prior results.
  - If user provided a <ULID>: Check if the task has subtasks with `vault0-task-subtasks(id, ready: true)`
  - OR interpret the users input and use `vault0-task-list(ready: true)`
2. **Pick**: Highest priority first — critical → high → normal → low. Same priority: first returned.
3. **Delegate**: One Executor Task() per task with optimal parallelization. The Executor reads, claims, implements, moves to `in_review`, reports back.
4. **Repeat**: **IMPORTANT** Fresh `vault0-task-list(ready: true)` or `vault0-task-subtasks(id, ready: true)` after each completion. Continue until none ready.

When no more subtasks are available using `vault0-task-subtasks(id, ready: true)` for a task, move the parent task to `in_review` as well

## Review Gate

- The Executor moves tasks to `in_review`, never directly to `done`.
- **The Orchestrator can move tasks to `backlog`, `todo`, `in_progress`, `in_review`, or `cancelled` — but NEVER to `done`.**
- Moving tasks to `done` is exclusively handled by the Git Agent via `vault0-task-complete` after a successful commit.
- Tasks approve via: (1) user says "approve" → delegate to Git Agent, or (2) commit → The Git Agent auto-approves via `vault0-task-complete`.
- While implementing a task that has many sub tasks or a plan, treat `in_review` as "complete" for dependency resolution — downstream tasks unblock.

## Quick Task Creation

User says "create a task": use `vault0-task-add` with `sourceFlag: "opencode"`. Return the ID.

## Natural Language Approval

When user says "approve", "LGTM", "ship it", etc.:
1. `vault0-task-list(status: "in_review")`
2. Delegate to the Git Agent to move each to `done` via `vault0-task-complete`
3. Report what was approved

**Note:** The `vault0-task-move` tool does NOT support `done` status. Only the Git Agent has access to `vault0-task-complete`.

## Assignment Rules

- Only assign tasks that are **ready** (deps satisfied = `done` or `in_review`) and in `backlog`/`todo`.
- Skip `in_progress`, `in_review`, `done`, `cancelled`.

## Bulk Subtask Delegation

For subtask batches: `vault0-task-subtasks(id, ready: true)` → one parallel Executor Task() per ready subtask on every iteration, continue until no more subtasks available.

## Post-Commit Boundary

After commit completes: relay results and **STOP**. Do NOT query for next tasks, suggest continuation, or report unblocked work. User must explicitly request new work.

## Error Handling

If The Executor reports failure: stop the loop, report to user, wait for direction. Failed tasks may block dependents.

## Completion

When `vault0-task-list(ready: true)` returns empty: either all done (summarize) or remaining blocked (report what's waiting on what).
