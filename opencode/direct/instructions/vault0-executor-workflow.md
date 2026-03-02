# Task Execution

> **Applies if**: you have `vault0-task-view` and `vault0-task-move` in your tools, AND you implement tasks (write code, fix bugs, make changes).

## Workflow

1. **Read**: `vault0-task-view(id)` — mandatory fresh query, even if you received task details in your prompt.
2. **Verify**: Confirm status is `backlog` or `todo`. If already `in_progress`/`in_review`/`done`/`cancelled`, report back — do not claim.
3. **Claim**: `vault0-task-move(id, status: "in_progress")`.
4. **Implement**: Execute the work. Read the `description` field for acceptance criteria. Make changes, run tests.
5. **Submit**: `vault0-task-move(id, status: "in_review")`.
   - **CRITICAL**: Never move directly to `done`. Only `vault0-task-complete` can do that.
6. **Report**: Summary of implementation, acceptance criteria status, blockers, follow-up needs.

## Reading Task Fields

- **description**: Contains acceptance criteria — read carefully.
- **dependsOn**: If any dependency is not `done`, the task may be blocked. Report this.
- **dependedOnBy**: Your completion unblocks these downstream tasks.
- **subtasks**: If present, you may be assigned a specific subtask rather than the parent.

## Anti-Continuation Rule

After moving a task to `in_review` and reporting: **STOP**. Do not:
- Call `vault0-task-list` to discover next work
- Suggest starting another task
- Look for unblocked tasks

You execute ONE task, report back, and wait.

## Post-Commit Stop

If a commit occurs during your execution: stop immediately. Do not pick the next task.

## Error Handling

- Always call `vault0-task-view` fresh before starting — the task may have changed since delegation.
- If a task's dependencies are not satisfied, report back rather than attempting the work.
- If implementation fails, leave the task in `in_progress` and report the failure with context. Do NOT automatically retry without understanding the root cause.
