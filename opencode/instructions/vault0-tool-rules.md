# Vault0 Tool Usage Rules

> These rules apply to **all roles** — Orchestrator, Executor, Planner, and Git Agent alike.

**IMPORTANT** vault0 uses ULID to identify its tasks, when the user mentiones an ULID you should assume they are talking about a vault0 task

## Tool Separation

- **`vault0-task-add`**: Create new tasks only. Never use to modify existing tasks.
Example:
  ```
  vault0-task-add(
    title: "Step N: <description>",
    description: "<details with acceptance criteria, files affected, verification>",
    priority: "normal", status: "backlog",
    parent: "<parent-id>", sourceFlag: "opencode-plan"
  )
  ```

- **`vault0-task-list`**: Query tasks with filters (status, priority, search, blocked, ready).
Example:
  ```
  vault0-task-list(status: "todo", priority: "high", ready: true)
  // Returns: ready tasks with high priority
  ```

- **`vault0-task-view`**: Get full task details by ID (subtasks, dependencies, history).
Example:
  ```
  vault0-task-view(id: "<task-id>")
  // Returns: full task with subtasks, dependencies, history
  ```

- **`vault0-task-update`**: Edit metadata only — title, description, priority, tags, type, solution, dependencies (`depAdd`/`depRemove`). Does NOT change status.
Example:
  ```
  vault0-task-update(
    id: "<task-id>", title: "<new-title>",
    priority: "critical", depAdd: "<blocking-task-id>"
  )
  ```

- **`vault0-task-move`**: Status transitions only — backlog → todo → in_progress → in_review → cancelled. **Cannot move to `done`** — use `vault0-task-complete` for that. Accepts optional `solution` parameter.
Example:
  ```
  vault0-task-move(
    id: "<task-id>", status: "in_progress",
    solution: "<optional-notes>"
  )
  ```

- **`vault0-task-complete`**: Moves a task to `done` status. **Git Agent only** — this is the exclusive mechanism for marking tasks complete. Accepts `id` and optional `solution`.
Example:
  ```
  vault0-task-complete(
    id: "<task-id>",
    solution: "<commit details or resolution summary>"
  )
  ```

- **`vault0-task-subtasks`**: List subtasks of a parent task. Use `ready: true` to filter to actionable work.
Example:
  ```
  vault0-task-subtasks(id: "<parent-task-id>", ready: true)
  // Returns: unblocked, not-done subtasks only
  ```

## Valid Values

- **Priority**: `"critical"`, `"high"`, `"normal"`, `"low"` — no other values accepted.
- **Status**: `"backlog"`, `"todo"`, `"in_progress"`, `"in_review"`, `"done"`, `"cancelled"`.
- **Type**: `"feature"`, `"bug"`, `"analysis"`.
- **Source**: `"opencode"` (ad-hoc), `"opencode-plan"` (plan-created).

## Stale State Rule

Tool outputs are snapshots, not live views. Always query fresh before acting — never rely on cached results from earlier in the conversation.
