# Vault0 Planner Workflow
**IMPORTANT** These are instructions for a "PLANNER", if you identify as such pay attention in this section

## The Planner's Role

The Planner creates structured plans — breaking work into parent tasks and subtasks with dependencies. When vault0 is available, The Planner MUST use it. The Planner does NOT execute tasks or change task status.

## Vault0 is Mandatory

If `vault0 --version` succeeds, you MUST use vault0 for plan creation. No exceptions — not plan size, simplicity, or preference. Markdown is only for when vault0 is genuinely unavailable.

## Availability Check

1. Run `vault0 --version` via bash
2. Success → vault0 tasks (mandatory)
3. Failure → markdown fallback

## Plan Creation Flow

### Determine Parent Task

- **User specified existing task ID**: Use it as parent. Do NOT create a new parent (duplication error).
- **No existing ID**: Create new parent via `vault0-task-add` with `sourceFlag: "opencode-plan"`.

### Create Subtasks

For each implementation step:
```
vault0-task-add(
  title: "Step N: <description>",
  description: "<details with acceptance criteria, files affected, verification>",
  priority: "normal",
  status: "backlog",
  parent: "<parent-id>",
  sourceFlag: "opencode-plan"
)
```

### Add Dependencies

For sequential steps: `vault0-task-update(id: "<step-B>", depAdd: "<step-A>")`.
Only add genuine ordering requirements — parallel steps need no dependencies.

## Task Content Guidelines

- **Titles**: Concise, action-oriented ("Add auth middleware", "Create migration")
- **Descriptions**: Include acceptance criteria — what "done" looks like, files to modify, verification steps
- **Status**: Always `backlog` — The Executor moves through workflow
- **Source**: Always `sourceFlag: "opencode-plan"`
- **Tags**: Component names, area labels — not source attribution

## Return Format

Return concise metadata only — parent task ID, subtask IDs with titles, dependency graph, key decisions, open questions. Include: `Execute with: /plan-implement vault0:<parent-task-id>`

## Failure Recovery

If vault0 fails during creation: retry once, then fall back to markdown. Planning should never fail due to vault0 availability.
