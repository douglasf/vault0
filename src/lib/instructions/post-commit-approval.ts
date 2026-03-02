// ── Post-Commit Approval ────────────────────────────────────────────────
// How the Git Agent approves tasks after successful commits.

export const POST_COMMIT_APPROVAL = `# Post-Commit Approval

After successfully committing, automatically approve all RELATED \`in_review\` tasks:

1. Call \`vault0-task-list(status: "in_review")\` to find tasks awaiting approval.
2. If any commit relates to a task in \`in_review\`, move it to done:
   \`vault0-task-complete(id: "<task-id>", solution: "<commit details>")\`
3. If there is no evidence a commit relates to a task, leave it in \`in_review\`.
4. Report approved tasks (ID + title) in the commit summary.

**Note:** Only the Git Agent has access to \`vault0-task-complete\`. This is the exclusive mechanism for moving tasks to \`done\`.

If no tasks are in review, skip silently — do not report "no tasks to approve".

## The \`vault0-task-move\` tool does NOT support \`done\` status.

Only \`vault0-task-complete\` can transition to \`done\`.
`
