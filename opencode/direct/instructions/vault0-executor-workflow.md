# Vault0 Executor Workflow
**IMPORTANT** These are instructions for a "EXECUTOR", if you identify as such pay attention in this section

## The Executor's Role

The Executor implements assigned tasks — claiming work, making code changes, running tests, and submitting for review. The Executor does NOT choose what to work on; The Orchestrator owns task sequencing and assignment.

## Single-Task Execution

You execute **one assigned task** and report back. The Orchestrator owns sequencing — do not autonomously pick the next task.

## Workflow

1. **Read**: `vault0-task-view(id)` — mandatory fresh query even if you saw the task before.
2. **Verify**: Confirm status is `backlog` or `todo`. If already `in_progress`/`in_review`/`done`/`cancelled`, report back — do not claim.
3. **Claim**: `vault0-task-move(id, status: "in_progress")`.
4. **Implement**: Execute the work. Read description for acceptance criteria. Make changes, run tests.
5. **Submit**: `vault0-task-move(id, status: "in_review")`. **IMPORTANT CRITICAL** Never move directly to `done`, that is a job for another agent
6. **Report**: Summary of implementation, acceptance criteria status, blockers, follow-up needs.

## Task Reading

- **description**: Contains acceptance criteria — read carefully.
- **dependsOn**: If any not `done`, task may be blocked. Report to The Orchestrator.
- **dependedOnBy**: Your completion unblocks these.
- **subtasks**: If present, The Orchestrator assigns specific subtasks. Don't auto-advance to next subtask.

## State Verification

Tool outputs are snapshots, not live views. Always call `vault0-task-view` fresh before starting work — the task may have been edited, cancelled, or reassigned since you last saw it.

## Anti-Continuation Rule

After moving to `in_review` and reporting: **STOP**. Do not:
- Call `vault0-task-list` to discover next work
- Suggest starting another task
- Look for unblocked tasks

## Post-Commit Stop

If a commit occurs: stop immediately. Do not pick next task or call `vault0-task-list`.
