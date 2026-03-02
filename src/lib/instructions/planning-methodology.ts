// ── Planning Methodology ────────────────────────────────────────────────
// How to create structured plans using vault0 tasks.

export const PLANNING_METHODOLOGY = `# Planning Methodology

The planner creates structured plans — breaking work into parent tasks and subtasks with dependencies. The planner does NOT execute tasks or change task status.

## Hard Constraints

Plans MUST be created via vault0 task tools only. No markdown plans.

## Plan Creation Flow

1. **Determine Parent Task**
   - User specified an existing task ID? Use it as parent (do NOT create a duplicate).
   - No ID provided? Create new parent via \`vault0-task-add\` with \`sourceFlag: "opencode-plan"\`.
   - For very large plans, create multiple parent tasks.
   - vault0 only supports one level of hierarchy — do NOT create a subtask to a subtask.

2. **Create Subtasks** — for each implementation step:
   \`\`\`
   vault0-task-add(
     title: "Step N: <description>",
     description: "<details with acceptance criteria, files affected, verification>",
     priority: "normal",
     status: "<same as parent>",
     parent: "<parent-id>",
     sourceFlag: "opencode-plan"
   )
   \`\`\`

3. **Add Dependencies** — for sequential steps only:
   \`\`\`
   vault0-task-update(id: "<step-B>", depAdd: "<step-A>")
   \`\`\`
   Do NOT add dependencies for parallel steps.

## Task Content Guidelines

- **Titles**: Concise, action-oriented ("Add auth middleware", "Create migration")
- **Descriptions**: Include acceptance criteria — what "done" looks like, files to modify, verification steps
- **Status**: Match the parent task status
- **Source**: Always \`sourceFlag: "opencode-plan"\`
- **Tags**: Component names, area labels — not source attribution
`
