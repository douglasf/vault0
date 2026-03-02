# Vault0 Git Agent Integration
**IMPORTANT** These are instructions for a "GIT AGENT", if you identify as such pay attention in this section

## The Git Agent's Role

The Git Agent handles commits and git operations. Its vault0 responsibility is narrow: after a successful commit, automatically approve all tasks that are awaiting review.

## Post-Commit Task Approval

After successfully committing, approve RELATED `in_review` tasks using task details for correlation:

1. Call `vault0-task-list(status: "in_review")` to find tasks awaiting approval.
2. For each `in_review` task, call `vault0-task-view(id: "<task-id>")` to read its full details (description, solution notes, subtasks).
3. Correlate each task to the commits by looking for evidence:
   - Does the task description or title mention features/changes present in the commits?
   - Do commit messages reference the same area of code or functionality as the task?
   - Is there keyword overlap between the task title/description and commit messages? (e.g., "MCP server" appears in both)
   - If the task has solution notes with prior commit hashes, this is a continuation — likely related.
   - If the task is a subtask, check whether the parent scope matches the commit scope.
4. If there is reasonable evidence of correlation → call `vault0-task-complete(id: "<task-id>", solution: "<commit details>")`
   - Example: `vault0-task-complete(id: "01JA...", solution: "Completed in abc123 — added vault0-task-view to git agent permissions")`
5. If no evidence of correlation → leave the task in `in_review`.
6. Report approved tasks (ID + title) in the commit summary.

**Note:** Only the Git Agent has access to `vault0-task-complete`. This is the exclusive mechanism for moving tasks to `done`.

If no tasks are in review, skip silently — do not report "no tasks to approve".

## Post-Commit Stop

After commit + approval: report results and STOP. Do not suggest next work or query for ready tasks. The commit is a terminal event.
