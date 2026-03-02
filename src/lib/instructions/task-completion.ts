// ── Task Completion ─────────────────────────────────────────────────────
// Workflow for agents that mark tasks as done via vault0_task-complete.

export const TASK_COMPLETION = `# ⛔ MANDATORY: Task Completion

> **Applies if**: you have \`vault0_task-complete\` in your tools.
>
> **THIS IS A HARD REQUIREMENT.** You MUST execute this workflow after every commit.
> Do NOT skip it. Do NOT defer it. Do NOT report results to the user until this is done.

## When This Applies

After commits are created and verified — regardless of how many commits, what kind of changes, or how the commit workflow was structured — you MUST perform task completion **before** reporting results.

\`vault0_task-complete\` is the ONLY mechanism that moves tasks from \`in_review\` to \`done\`. If you skip this, completed work stays stuck in \`in_review\` forever. \`vault0_task-move\` cannot move to \`done\`. Only \`vault0_task-complete\` can.

## Procedure (MANDATORY — execute every step)

1. **Call \`vault0_task-list(status: "in_review")\`** to find all tasks awaiting approval.
   - If no tasks are in review → done with this step. Proceed to report results. Do not mention this check.
   - If tasks ARE in review → continue to step 2.

2. **For each \`in_review\` task, call \`vault0_task-view(id)\`** to read its full details.

3. **Correlate each task to the commits you just created.** Look for evidence:
   - Does the task description/title mention features or changes present in the commits?
   - Do commit messages reference the same area of code or functionality?
   - Is there keyword overlap between the task and commit messages?
   - If the task has solution notes with prior commit hashes, it's a continuation — likely related.
   - If the task is a subtask, check whether the parent scope matches the commit scope.

4. **If reasonable evidence of correlation → complete immediately:**
   \`vault0_task-complete(id: "<task-id>", solution: "<commit hash> — <what was done>")\`

5. **If no evidence of correlation → leave in \`in_review\`.** Do not complete unrelated tasks.

6. **Include approved tasks (ID + title) in your summary.**

## Post-Completion Stop

After completing tasks: report results and STOP. Do not suggest next work or query for ready tasks. The commit is a terminal event.

## Compliance Check

Before writing your final response, verify: "Did I check for \`in_review\` tasks and process them?" If no, STOP and do it now.
`
