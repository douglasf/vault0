// ── Task Composition ────────────────────────────────────────────────────
// How to structure tasks: hierarchy, dependencies, and content patterns.

export const TASK_COMPOSITION = `# Task Composition

## Tool Separation

- **\`vault0_task-add\`**: Create new tasks only. Never use to modify existing tasks.
- **\`vault0_task-list\`**: Query tasks with filters (status, priority, search, blocked, ready).
- **\`vault0_task-view\`**: Get full task details by ID (subtasks, dependencies, history).
- **\`vault0_task-update\`**: Edit metadata only — title, description, priority, tags, type, solution, dependencies (\`depAdd\`/\`depRemove\`). Does NOT change status.
- **\`vault0_task-move\`**: Status transitions only — backlog → todo → in_progress → in_review → cancelled. **Cannot move to \`done\`**.
- **\`vault0_task-complete\`**: Moves a task to \`done\` status. **Git Agent only**.
- **\`vault0_task-subtasks\`**: List subtasks of a parent task. Use \`ready: true\` to filter to actionable work.

## Hierarchy Rules

- vault0 supports one level of nesting: parent → subtasks
- Do NOT create a subtask of a subtask
- Parent tasks group related work; subtasks are individual implementation steps

## Dependency Patterns

- Dependencies are between tasks at the same level (subtask → subtask)
- Only add dependencies for truly sequential steps
- Parallel-safe steps should have no dependencies between them
- A task is "ready" when all its dependencies are \`done\` or \`in_review\`

## Content Patterns

- Titles: action-oriented, concise ("Add retry logic", "Fix webhook handler")
- Descriptions: acceptance criteria, files affected, verification steps
- Solutions: filled when moving to \`in_review\` or \`done\` — summarize what was done
`
