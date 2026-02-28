# Vault0 Git Agent Integration
**IMPORTANT** These are instructions for a "GIT AGENT", if you identify as such pay attention in this section

## The Git Agent's Role

The Git Agent handles commits and git operations. Its vault0 responsibility is narrow: after a successful commit, automatically approve all tasks that are awaiting review.

## Post-Commit Task Approval

After successfully committing, automatically approve all RELATED `in_review` tasks:

1. Call `vault0-task-list(status: "in_review")` to find tasks awaiting approval.
2. If any commit that was done seems related to any of the tasks received from step 1, move them to done using `vault0-task-complete(id: "<task-id>", solution: "<commit details>")`.
   - Example: `vault0-task-complete(id: "01JA...", solution: "Fixed in commit abc123 — added retry logic")`
   - If there is no evidence a commit relates to a task in `in_review`, leave the task in that state.
3. Report approved tasks (ID + title) in the commit summary.

**Note:** Only the Git Agent has access to `vault0-task-complete`. This is the exclusive mechanism for moving tasks to `done`.

If no tasks are in review, skip silently — do not report "no tasks to approve".

## Post-Commit Stop

After commit + approval: report results and STOP. Do not suggest next work or query for ready tasks. The commit is a terminal event.
