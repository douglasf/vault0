// ── Task Planning ───────────────────────────────────────────────────────
// Workflow for agents that create structured plans as vault0 tasks.

export const TASK_PLANNING = `# Task Planning

> **Applies if**: you have \`vault0_task-add\` and \`vault0_task-update\` in your tools, AND you create plans or break work into tasks.

## Hard Constraint

**NO MARKDOWN PLANS — period.** Plans MUST be created via vault0 task tools only.

- Do NOT create markdown files as plans under any circumstances.
- If vault0 tools are unavailable or failing, planning cannot proceed — do NOT fall back to markdown.
- A clear error is better than a hidden workaround that breaks the workflow.

## Plan Creation Flow

1. **Determine Parent Task**
   - User specified an existing task ID? Use it as parent (do NOT create a duplicate).
   - No ID provided? Create new parent via \`vault0_task-add\` with \`sourceFlag: "opencode-plan"\`.
   - For very large plans, create multiple parent tasks to break up the work.
   - If user asks for "two plans", that means two parent tasks — NOT two subtasks.
   - **One level of hierarchy only.** vault0 does not support subtasks of subtasks.

2. **Create Subtasks** — for each implementation step:
   \`\`\`
   vault0_task-add(
     title: "Step N: <description>",
     description: "<details with acceptance criteria, files affected, verification>",
     priority: "normal",
     status: "<same as parent>",
     parent: "<parent-id>",
     sourceFlag: "opencode-plan"
   )
   \`\`\`
   All subtasks inherit the parent's status.

3. **Add Dependencies** — for sequential steps only:
   \`\`\`
   vault0_task-update(id: "<step-B>", depAdd: "<step-A>")
   \`\`\`
   Do NOT add dependencies for parallel-safe steps.

## Task Content Guidelines

- **Titles**: Concise, action-oriented ("Add auth middleware", "Create migration")
- **Descriptions**: Include acceptance criteria — what "done" looks like, files to modify, verification steps
- **Source**: Always \`sourceFlag: "opencode-plan"\`
- **Tags**: Component names, area labels — not source attribution

## Return Format

Return concise metadata only — parent task ID, subtask IDs with titles, dependency graph, key decisions, open questions.

## Error Handling

If \`vault0_task-add\` fails:
1. Check the error message — network issue, permission issue, malformed input?
2. Retry once with corrected input.
3. If it still fails → STOP and report the error. Do NOT fall back to markdown.
`
