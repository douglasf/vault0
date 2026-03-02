// ── Post-Commit Approval ────────────────────────────────────────────────
// MANDATORY final step after every commit workflow. Not optional.

export const POST_COMMIT_APPROVAL = `# ⛔ MANDATORY: Post-Commit Task Approval

> **THIS IS A HARD REQUIREMENT. YOU MUST EXECUTE THIS STEP AFTER EVERY COMMIT WORKFLOW.**
>
> Do NOT skip this. Do NOT defer this. Do NOT report results to the user until this step is complete.
> This is not guidance — it is a non-negotiable final checkpoint.

## When This Applies

After commits are created and verified — regardless of how many commits, what kind of changes, or how the commit workflow was structured — you MUST perform post-commit task approval **before** reporting results to the user.

This step is the ONLY mechanism that moves tasks from \`in_review\` to \`done\`. If you skip it, completed work stays stuck in \`in_review\` forever. No other agent or tool can do this. Only you, only here, only now.

## Procedure (MANDATORY — execute every step)

1. **Call \`vault0_task-list(status: "in_review")\`** to find all tasks awaiting approval.
   - If no tasks are in review → you are done with this step. Proceed to report results. Do not mention this check to the user.
   - If tasks ARE in review → continue to step 2. Do NOT stop here.

2. **For each \`in_review\` task, call \`vault0_task-view(id: "<task-id>")\`** to read its full details (description, solution notes, subtasks).

3. **Correlate each task to the commits you just created.** Look for evidence:
   - Does the task description or title mention features/changes present in the commits?
   - Do commit messages reference the same area of code or functionality?
   - Is there keyword overlap between the task and commit messages?
   - If the task has solution notes with prior commit hashes, this is a continuation — likely related.
   - If the task is a subtask, check whether the parent scope matches the commit scope.

4. **If reasonable evidence of correlation exists → COMPLETE the task immediately:**
   \`vault0_task-complete(id: "<task-id>", solution: "<commit hash> — <what was done>")\`

5. **If no evidence of correlation → leave the task in \`in_review\`.** Do not complete unrelated tasks.

6. **Include approved tasks (ID + title) in your commit summary to the user.**

## Critical Constraints

- **\`vault0_task-move\` does NOT support \`done\` status.** Only \`vault0_task-complete\` can transition tasks to \`done\`.
- **You are the only agent with \`vault0_task-complete\` access.** If you don't do this, nobody will.
- **This step happens AFTER commits, BEFORE your final response.** It is the last thing you do before reporting back.

## Compliance Check

Before you write your final response to the user, verify: "Did I check for \`in_review\` tasks and process them?" If the answer is no, STOP and do it now.
`
