import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { createTestDb, closeTestDb, type TestDb } from "./helpers.js"
import { createTask, addDependency, updateTaskStatus, archiveTask } from "../db/queries.js"
import {
  cmdAdd,
  cmdList,
  cmdView,
  cmdEdit,
  cmdMove,
  cmdDelete,
  cmdUnarchive,
  cmdDepAdd,
  cmdDepRemove,
  cmdDepList,
  type CommandResult,
} from "../cli/commands.js"
import type { Task, TaskDetail } from "../lib/types.js"

/** Helper to extract data from a CommandResult with a known shape. */
function getData(result: CommandResult): Record<string, unknown> {
  return result.data as Record<string, unknown>
}

// ═══════════════════════════════════════════════════════════════════
// cmdAdd
// ═══════════════════════════════════════════════════════════════════

describe("cmdAdd", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("creates task with --title", () => {
    const result = cmdAdd(testDb.db, { title: "New task" }, "text")
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    const task = getData(result)
    expect(task.title).toBe("New task")
    expect(task.status).toBe("backlog")
    expect(task.priority).toBe("normal")
  })

  test("returns error when --title is missing", () => {
    const result = cmdAdd(testDb.db, {}, "text")
    expect(result.success).toBe(false)
    expect(result.message).toContain("--title is required")
  })

  test("respects --priority flag", () => {
    const result = cmdAdd(testDb.db, { title: "High pri", priority: "high" }, "text")
    expect(result.success).toBe(true)
    expect(getData(result).priority).toBe("high")
  })

  test("respects --status flag", () => {
    const result = cmdAdd(testDb.db, { title: "Todo", status: "todo" }, "text")
    expect(result.success).toBe(true)
    expect(getData(result).status).toBe("todo")
  })

  test("rejects invalid --priority", () => {
    expect(() => {
      cmdAdd(testDb.db, { title: "Bad", priority: "ultra" }, "text")
    }).toThrow('Invalid priority: "ultra"')
  })

  test("rejects invalid --status", () => {
    expect(() => {
      cmdAdd(testDb.db, { title: "Bad", status: "invalid" }, "text")
    }).toThrow('Invalid status: "invalid"')
  })

  test("rejects invalid --type", () => {
    expect(() => {
      cmdAdd(testDb.db, { title: "Bad", type: "epic" }, "text")
    }).toThrow('Invalid type: "epic"')
  })

  test("handles --tags (comma-separated)", () => {
    const result = cmdAdd(testDb.db, { title: "Tagged", tags: "frontend,bug,urgent" }, "text")
    expect(result.success).toBe(true)
    // View the task to verify tags were applied
    const viewResult = cmdView(testDb.db, getData(result).id as string, "json")
    const detail = JSON.parse(viewResult.message)
    expect(detail.tags).toEqual(["frontend", "bug", "urgent"])
  })

  test("handles --tags with whitespace around commas", () => {
    const result = cmdAdd(testDb.db, { title: "Tagged", tags: " frontend , bug , urgent " }, "text")
    expect(result.success).toBe(true)
    const viewResult = cmdView(testDb.db, getData(result).id as string, "json")
    const detail = JSON.parse(viewResult.message)
    expect(detail.tags).toEqual(["frontend", "bug", "urgent"])
  })

  test("handles --parent (creates subtask)", () => {
    const parent = createTask(testDb.db, { boardId: testDb.boardId, title: "Parent" })
    const result = cmdAdd(testDb.db, { title: "Child", parent: parent.id }, "text")
    expect(result.success).toBe(true)
    expect(getData(result).parentId).toBe(parent.id)
  })

  test("rejects subtask-of-subtask via --parent", () => {
    const parent = createTask(testDb.db, { boardId: testDb.boardId, title: "Parent" })
    const child = createTask(testDb.db, { boardId: testDb.boardId, parentId: parent.id, title: "Child" })
    const result = cmdAdd(testDb.db, { title: "Grandchild", parent: child.id }, "text")
    expect(result.success).toBe(false)
    expect(result.message).toContain("Cannot add a subtask to a subtask")
  })

  test("json format returns valid JSON", () => {
    const result = cmdAdd(testDb.db, { title: "JSON task" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.title).toBe("JSON task")
    expect(parsed.id).toBeDefined()
  })

  test("json format includes tags when --tags is provided", () => {
    const result = cmdAdd(testDb.db, { title: "Tagged JSON", tags: "alpha,beta" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.title).toBe("Tagged JSON")
    expect(parsed.tags).toEqual(["alpha", "beta"])
  })

  test("text format returns success message with task ID", () => {
    const result = cmdAdd(testDb.db, { title: "Text task" }, "text")
    expect(result.success).toBe(true)
    expect(result.message).toContain("✓")
    expect(result.message).toContain("Task created")
    expect(result.message).toContain("Text task")
  })

  test("respects --description flag", () => {
    const result = cmdAdd(testDb.db, { title: "Described", description: "A detailed description" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.description).toBe("A detailed description")
  })

  test("respects --source flag", () => {
    const result = cmdAdd(testDb.db, { title: "From OC", source: "opencode" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.source).toBe("opencode")
  })

  test("rejects invalid --source", () => {
    expect(() => {
      cmdAdd(testDb.db, { title: "Bad", source: "github" }, "text")
    }).toThrow('Invalid source: "github"')
  })

  test("respects --type flag", () => {
    const result = cmdAdd(testDb.db, { title: "Bug fix", type: "bug" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.type).toBe("bug")
  })

  test("defaults to no type when --type is omitted", () => {
    const result = cmdAdd(testDb.db, { title: "No type" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.type).toBeNull()
  })

  test("supports partial ID for --parent", () => {
    const parent = createTask(testDb.db, { boardId: testDb.boardId, title: "Parent" })
    const suffix = parent.id.slice(-8)
    const result = cmdAdd(testDb.db, { title: "Child via partial", parent: suffix }, "text")
    expect(result.success).toBe(true)
    expect(getData(result).parentId).toBe(parent.id)
  })
})

// ═══════════════════════════════════════════════════════════════════
// cmdList
// ═══════════════════════════════════════════════════════════════════

describe("cmdList", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("lists all tasks for default board", () => {
    createTask(testDb.db, { boardId: testDb.boardId, title: "Task A" })
    createTask(testDb.db, { boardId: testDb.boardId, title: "Task B" })

    const result = cmdList(testDb.db, {}, "text")
    expect(result.success).toBe(true)
    expect(result.message).toContain("Task A")
    expect(result.message).toContain("Task B")
    expect(result.message).toContain("2 task(s)")
  })

  test("filters by --status", () => {
    createTask(testDb.db, { boardId: testDb.boardId, title: "Backlog", status: "backlog" })
    createTask(testDb.db, { boardId: testDb.boardId, title: "Todo", status: "todo" })

    const result = cmdList(testDb.db, { status: "todo" }, "json")
    expect(result.success).toBe(true)
    const cards = JSON.parse(result.message)
    expect(cards).toHaveLength(1)
    expect(cards[0].title).toBe("Todo")
  })

  test("filters by --priority", () => {
    createTask(testDb.db, { boardId: testDb.boardId, title: "Normal", priority: "normal" })
    createTask(testDb.db, { boardId: testDb.boardId, title: "Critical", priority: "critical" })

    const result = cmdList(testDb.db, { priority: "critical" }, "json")
    expect(result.success).toBe(true)
    const cards = JSON.parse(result.message)
    expect(cards).toHaveLength(1)
    expect(cards[0].title).toBe("Critical")
  })

  test("filters by --search (title match)", () => {
    createTask(testDb.db, { boardId: testDb.boardId, title: "Fix login bug" })
    createTask(testDb.db, { boardId: testDb.boardId, title: "Add feature" })

    const result = cmdList(testDb.db, { search: "login" }, "json")
    expect(result.success).toBe(true)
    const cards = JSON.parse(result.message)
    expect(cards).toHaveLength(1)
    expect(cards[0].title).toBe("Fix login bug")
  })

  test("filters by --search (description match)", () => {
    createTask(testDb.db, { boardId: testDb.boardId, title: "Task A", description: "Contains keyword foobar here" })
    createTask(testDb.db, { boardId: testDb.boardId, title: "Task B", description: "Nothing special" })

    const result = cmdList(testDb.db, { search: "foobar" }, "json")
    expect(result.success).toBe(true)
    const cards = JSON.parse(result.message)
    expect(cards).toHaveLength(1)
    expect(cards[0].title).toBe("Task A")
  })

  test("filters by --search is case-insensitive", () => {
    createTask(testDb.db, { boardId: testDb.boardId, title: "Fix LOGIN Bug" })

    const result = cmdList(testDb.db, { search: "login" }, "json")
    expect(result.success).toBe(true)
    const cards = JSON.parse(result.message)
    expect(cards).toHaveLength(1)
  })

  test("filters by --blocked flag", () => {
    const taskA = createTask(testDb.db, { boardId: testDb.boardId, title: "Blocked task" })
    const taskB = createTask(testDb.db, { boardId: testDb.boardId, title: "Blocker" })
    addDependency(testDb.db, taskA.id, taskB.id)

    const result = cmdList(testDb.db, { blocked: "true" }, "json")
    expect(result.success).toBe(true)
    const cards = JSON.parse(result.message)
    expect(cards).toHaveLength(1)
    expect(cards[0].title).toBe("Blocked task")
  })

  test("filters by --blocked flag (empty string treated as true)", () => {
    const taskA = createTask(testDb.db, { boardId: testDb.boardId, title: "Blocked task" })
    const taskB = createTask(testDb.db, { boardId: testDb.boardId, title: "Blocker" })
    addDependency(testDb.db, taskA.id, taskB.id)

    const result = cmdList(testDb.db, { blocked: "" }, "json")
    expect(result.success).toBe(true)
    const cards = JSON.parse(result.message)
    expect(cards).toHaveLength(1)
    expect(cards[0].title).toBe("Blocked task")
  })

  test("filters by --ready flag", () => {
    const taskA = createTask(testDb.db, { boardId: testDb.boardId, title: "Ready task", status: "backlog" })
    const taskB = createTask(testDb.db, { boardId: testDb.boardId, title: "Blocked task", status: "backlog" })
    const blocker = createTask(testDb.db, { boardId: testDb.boardId, title: "Blocker", status: "todo" })
    addDependency(testDb.db, taskB.id, blocker.id)

    const result = cmdList(testDb.db, { ready: "true" }, "json")
    expect(result.success).toBe(true)
    const cards = JSON.parse(result.message)
    // "Ready task" and "Blocker" are both ready (no unmet deps and backlog/todo status)
    const readyTitles = cards.map((c: Record<string, unknown>) => c.title)
    expect(readyTitles).toContain("Ready task")
    expect(readyTitles).toContain("Blocker")
    expect(readyTitles).not.toContain("Blocked task")
  })

  test("json format returns array", () => {
    createTask(testDb.db, { boardId: testDb.boardId, title: "Task" })
    const result = cmdList(testDb.db, {}, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBeGreaterThanOrEqual(1)
  })

  test("empty result returns 'No tasks found' in text format", () => {
    // Filter for a status that has no tasks
    const result = cmdList(testDb.db, { status: "in_review" }, "text")
    expect(result.success).toBe(true)
    expect(result.message).toContain("No tasks found")
  })

  test("empty result returns empty array in json format", () => {
    const result = cmdList(testDb.db, { status: "in_review" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed).toEqual([])
  })

  test("rejects invalid --status", () => {
    expect(() => {
      cmdList(testDb.db, { status: "invalid" }, "text")
    }).toThrow('Invalid status: "invalid"')
  })

  test("rejects invalid --priority", () => {
    expect(() => {
      cmdList(testDb.db, { priority: "mega" }, "text")
    }).toThrow('Invalid priority: "mega"')
  })

  test("combines filters (status + priority)", () => {
    createTask(testDb.db, { boardId: testDb.boardId, title: "Match", status: "todo", priority: "high" })
    createTask(testDb.db, { boardId: testDb.boardId, title: "Wrong status", status: "backlog", priority: "high" })
    createTask(testDb.db, { boardId: testDb.boardId, title: "Wrong priority", status: "todo", priority: "low" })

    const result = cmdList(testDb.db, { status: "todo", priority: "high" }, "json")
    const cards = JSON.parse(result.message)
    expect(cards).toHaveLength(1)
    expect(cards[0].title).toBe("Match")
  })

  test("filters by --status cancelled returns cancelled tasks", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Cancelled task", status: "backlog" })
    updateTaskStatus(testDb.db, task.id, "cancelled")

    const result = cmdList(testDb.db, { status: "cancelled" }, "json")
    expect(result.success).toBe(true)
    const cards = JSON.parse(result.message)
    expect(cards).toHaveLength(1)
    expect(cards[0].title).toBe("Cancelled task")
    expect(cards[0].status).toBe("cancelled")
  })

  test("non-existent board ID returns empty results", () => {
    createTask(testDb.db, { boardId: testDb.boardId, title: "Existing task" })

    const result = cmdList(testDb.db, { board: "NONEXISTENT_BOARD_ID" }, "json")
    expect(result.success).toBe(true)
    const cards = JSON.parse(result.message)
    expect(cards).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════
// cmdView
// ═══════════════════════════════════════════════════════════════════

describe("cmdView", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("returns full task detail in text format", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "View me",
      description: "A detailed description",
      priority: "high",
    })

    const result = cmdView(testDb.db, task.id, "text")
    expect(result.success).toBe(true)
    expect(result.message).toContain("View me")
    expect(result.message).toContain("A detailed description")
  })

  test("returns full task detail in json format", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "JSON view",
      description: "Details here",
      priority: "critical",
    })

    const result = cmdView(testDb.db, task.id, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.title).toBe("JSON view")
    expect(parsed.description).toBe("Details here")
    expect(parsed.priority).toBe("critical")
    expect(parsed.subtasks).toBeDefined()
    expect(parsed.dependsOn).toBeDefined()
    expect(parsed.dependedOnBy).toBeDefined()
    expect(parsed.statusHistory).toBeDefined()
  })

  test("requires task ID (returns error if missing)", () => {
    const result = cmdView(testDb.db, "", "text")
    expect(result.success).toBe(false)
    expect(result.message).toContain("Task ID is required")
  })

  test("supports partial ID (suffix match)", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Partial ID" })
    const suffix = task.id.slice(-8)

    const result = cmdView(testDb.db, suffix, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.title).toBe("Partial ID")
    expect(parsed.id).toBe(task.id)
  })

  test("throws on non-existent task ID", () => {
    expect(() => {
      cmdView(testDb.db, "nonexistent-id", "text")
    }).toThrow("No task found matching ID")
  })

  test("includes subtasks in detail view", () => {
    const parent = createTask(testDb.db, { boardId: testDb.boardId, title: "Parent" })
    createTask(testDb.db, { boardId: testDb.boardId, parentId: parent.id, title: "Child 1" })
    createTask(testDb.db, { boardId: testDb.boardId, parentId: parent.id, title: "Child 2" })

    const result = cmdView(testDb.db, parent.id, "json")
    const parsed = JSON.parse(result.message)
    expect(parsed.subtasks).toHaveLength(2)
  })

  test("includes dependencies in detail view", () => {
    const taskA = createTask(testDb.db, { boardId: testDb.boardId, title: "Task A" })
    const taskB = createTask(testDb.db, { boardId: testDb.boardId, title: "Task B" })
    addDependency(testDb.db, taskA.id, taskB.id)

    const result = cmdView(testDb.db, taskA.id, "json")
    const parsed = JSON.parse(result.message)
    expect(parsed.dependsOn).toHaveLength(1)
    expect(parsed.dependsOn[0].id).toBe(taskB.id)
  })
})

// ═══════════════════════════════════════════════════════════════════
// cmdEdit
// ═══════════════════════════════════════════════════════════════════

describe("cmdEdit", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("updates title", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Original" })
    const result = cmdEdit(testDb.db, task.id, { title: "Updated" }, "text")
    expect(result.success).toBe(true)
    expect(result.message).toContain("Updated")
  })

  test("updates description", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task" })
    const result = cmdEdit(testDb.db, task.id, { description: "New desc" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.description).toBe("New desc")
  })

  test("updates priority", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task" })
    const result = cmdEdit(testDb.db, task.id, { priority: "critical" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.priority).toBe("critical")
  })

  test("updates tags", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task" })
    const result = cmdEdit(testDb.db, task.id, { tags: "new,tags" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.tags).toEqual(["new", "tags"])
  })

  test("updates type", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task" })
    const result = cmdEdit(testDb.db, task.id, { type: "bug" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.type).toBe("bug")
  })

  test("clears type when --type is empty string", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task" })
    // First set a type
    cmdEdit(testDb.db, task.id, { type: "bug" }, "text")
    // Then clear it
    const result = cmdEdit(testDb.db, task.id, { type: "" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.type).toBeNull()
  })

  test("returns error when no updates specified", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task" })
    const result = cmdEdit(testDb.db, task.id, {}, "text")
    expect(result.success).toBe(false)
    expect(result.message).toContain("No updates specified")
  })

  test("returns error when task ID is missing", () => {
    const result = cmdEdit(testDb.db, "", { title: "Nope" }, "text")
    expect(result.success).toBe(false)
    expect(result.message).toContain("Task ID is required")
  })

  test("validates --priority enum", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task" })
    expect(() => {
      cmdEdit(testDb.db, task.id, { priority: "ultra" }, "text")
    }).toThrow('Invalid priority: "ultra"')
  })

  test("validates --type enum", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task" })
    expect(() => {
      cmdEdit(testDb.db, task.id, { type: "epic" }, "text")
    }).toThrow('Invalid type: "epic"')
  })

  test("json format returns updated task", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Original" })
    const result = cmdEdit(testDb.db, task.id, { title: "Changed" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.title).toBe("Changed")
    expect(parsed.id).toBe(task.id)
  })

  test("text format returns success message", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Original" })
    const result = cmdEdit(testDb.db, task.id, { title: "Changed" }, "text")
    expect(result.success).toBe(true)
    expect(result.message).toContain("✓")
    expect(result.message).toContain("Task updated")
    expect(result.message).toContain("Changed")
  })

  test("supports partial ID", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Original" })
    const suffix = task.id.slice(-8)
    const result = cmdEdit(testDb.db, suffix, { title: "Via partial" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.title).toBe("Via partial")
  })

  test("updates multiple fields at once", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Original" })
    const result = cmdEdit(testDb.db, task.id, { title: "New title", priority: "high", description: "New desc" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.title).toBe("New title")
    expect(parsed.priority).toBe("high")
    expect(parsed.description).toBe("New desc")
  })
})

// ═══════════════════════════════════════════════════════════════════
// cmdMove
// ═══════════════════════════════════════════════════════════════════

describe("cmdMove", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("moves task to new status", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task", status: "backlog" })
    const result = cmdMove(testDb.db, task.id, { status: "todo" }, "text")
    expect(result.success).toBe(true)
    expect(result.message).toContain("moved to todo")
  })

  test("json format includes parentAutoCompleted field", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task", status: "backlog" })
    const result = cmdMove(testDb.db, task.id, { status: "in_progress" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.status).toBe("in_progress")
    expect(parsed.parentAutoCompleted).toBeUndefined()
  })

  test("reports parent auto-completion in text format", () => {
    const parent = createTask(testDb.db, { boardId: testDb.boardId, title: "Parent", status: "in_progress" })
    const child = createTask(testDb.db, { boardId: testDb.boardId, parentId: parent.id, title: "Only child", status: "in_progress" })

    const result = cmdMove(testDb.db, child.id, { status: "done" }, "text")
    expect(result.success).toBe(true)
    expect(result.message).toContain("moved to done")
    expect(result.message).toContain("Parent")
    expect(result.message).toContain("auto-completed")
  })

  test("reports parent auto-completion in json format", () => {
    const parent = createTask(testDb.db, { boardId: testDb.boardId, title: "Parent", status: "in_progress" })
    const child = createTask(testDb.db, { boardId: testDb.boardId, parentId: parent.id, title: "Only child", status: "in_progress" })

    const result = cmdMove(testDb.db, child.id, { status: "done" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.parentAutoCompleted).toBeDefined()
    expect(parsed.parentAutoCompleted.id).toBe(parent.id)
  })

  test("requires --status flag", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task" })
    const result = cmdMove(testDb.db, task.id, {}, "text")
    expect(result.success).toBe(false)
    expect(result.message).toContain("--status is required")
  })

  test("requires task ID", () => {
    const result = cmdMove(testDb.db, "", { status: "todo" }, "text")
    expect(result.success).toBe(false)
    expect(result.message).toContain("Task ID is required")
  })

  test("validates --status enum", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task" })
    expect(() => {
      cmdMove(testDb.db, task.id, { status: "invalid" }, "text")
    }).toThrow('Invalid status: "invalid"')
  })

  test("supports partial ID", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task", status: "backlog" })
    const suffix = task.id.slice(-8)
    const result = cmdMove(testDb.db, suffix, { status: "todo" }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.status).toBe("todo")
  })
})

// ═══════════════════════════════════════════════════════════════════
// cmdDelete
// ═══════════════════════════════════════════════════════════════════

describe("cmdDelete", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("soft-deletes on first delete (archives)", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Delete me" })
    const result = cmdDelete(testDb.db, task.id, "text")
    expect(result.success).toBe(true)
    expect(result.message).toContain("archived")
    expect(result.message).not.toContain("permanently deleted")
  })

  test("hard-deletes on second delete (permanent)", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Delete me" })
    cmdDelete(testDb.db, task.id, "text") // first = archive
    const result = cmdDelete(testDb.db, task.id, "text") // second = hard delete
    expect(result.success).toBe(true)
    expect(result.message).toContain("permanently deleted")
  })

  test("requires task ID", () => {
    const result = cmdDelete(testDb.db, "", "text")
    expect(result.success).toBe(false)
    expect(result.message).toContain("Task ID is required")
  })

  test("json format returns archive/hardDeleted info", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "JSON delete" })
    const result = cmdDelete(testDb.db, task.id, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.archived).toBe(true)
    expect(parsed.hardDeleted).toBe(false)
    expect(parsed.title).toBe("JSON delete")
  })

  test("json format for hard delete", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Hard delete" })
    cmdDelete(testDb.db, task.id, "text") // first = archive
    const result = cmdDelete(testDb.db, task.id, "json") // second = hard delete
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.hardDeleted).toBe(true)
    expect(parsed.archived).toBe(false)
  })

  test("supports partial ID", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Delete partial" })
    const suffix = task.id.slice(-8)
    const result = cmdDelete(testDb.db, suffix, "text")
    expect(result.success).toBe(true)
    expect(result.message).toContain("archived")
  })

  test("throws on non-existent task ID", () => {
    expect(() => {
      cmdDelete(testDb.db, "nonexistent-id", "text")
    }).toThrow("No task found matching ID")
  })
})

// ═══════════════════════════════════════════════════════════════════
// cmdUnarchive
// ═══════════════════════════════════════════════════════════════════

describe("cmdUnarchive", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("restores an archived task", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Restore me" })
    archiveTask(testDb.db, task.id)
    const result = cmdUnarchive(testDb.db, task.id, "text")
    expect(result.success).toBe(true)
    expect(result.message).toContain("unarchived")
  })

  test("json format returns unarchived info", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Restore json" })
    archiveTask(testDb.db, task.id)
    const result = cmdUnarchive(testDb.db, task.id, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.unarchived).toBe(true)
    expect(parsed.id).toBe(task.id)
  })

  test("throws if task is not archived", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Not archived" })
    expect(() => {
      cmdUnarchive(testDb.db, task.id, "text")
    }).toThrow("not archived")
  })

  test("returns error if no task ID provided", () => {
    const result = cmdUnarchive(testDb.db, "", "text")
    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════
// cmdDepAdd
// ═══════════════════════════════════════════════════════════════════

describe("cmdDepAdd", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("adds dependency between tasks", () => {
    const taskA = createTask(testDb.db, { boardId: testDb.boardId, title: "Task A" })
    const taskB = createTask(testDb.db, { boardId: testDb.boardId, title: "Task B" })

    const result = cmdDepAdd(testDb.db, taskA.id, { on: taskB.id }, "text")
    expect(result.success).toBe(true)
    expect(result.message).toContain("Dependency added")
    expect(result.message).toContain("depends on")
  })

  test("json format returns dependency info", () => {
    const taskA = createTask(testDb.db, { boardId: testDb.boardId, title: "Task A" })
    const taskB = createTask(testDb.db, { boardId: testDb.boardId, title: "Task B" })

    const result = cmdDepAdd(testDb.db, taskA.id, { on: taskB.id }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.taskId).toBe(taskA.id)
    expect(parsed.dependsOn).toBe(taskB.id)
  })

  test("rejects cycle (A→B then B→A)", () => {
    const taskA = createTask(testDb.db, { boardId: testDb.boardId, title: "Task A" })
    const taskB = createTask(testDb.db, { boardId: testDb.boardId, title: "Task B" })

    cmdDepAdd(testDb.db, taskA.id, { on: taskB.id }, "text")

    expect(() => {
      cmdDepAdd(testDb.db, taskB.id, { on: taskA.id }, "text")
    }).toThrow("cycle")
  })

  test("returns error when --on is missing", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task" })
    const result = cmdDepAdd(testDb.db, task.id, {}, "text")
    expect(result.success).toBe(false)
    expect(result.message).toContain("--on is required")
  })

  test("returns error when task ID is missing", () => {
    const result = cmdDepAdd(testDb.db, "", { on: "some-id" }, "text")
    expect(result.success).toBe(false)
    expect(result.message).toContain("Task ID is required")
  })

  test("supports partial IDs", () => {
    const taskA = createTask(testDb.db, { boardId: testDb.boardId, title: "Task A" })
    const taskB = createTask(testDb.db, { boardId: testDb.boardId, title: "Task B" })

    const suffixA = taskA.id.slice(-8)
    const suffixB = taskB.id.slice(-8)

    const result = cmdDepAdd(testDb.db, suffixA, { on: suffixB }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.taskId).toBe(taskA.id)
    expect(parsed.dependsOn).toBe(taskB.id)
  })
})

// ═══════════════════════════════════════════════════════════════════
// cmdDepRemove
// ═══════════════════════════════════════════════════════════════════

describe("cmdDepRemove", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("removes dependency between tasks", () => {
    const taskA = createTask(testDb.db, { boardId: testDb.boardId, title: "Task A" })
    const taskB = createTask(testDb.db, { boardId: testDb.boardId, title: "Task B" })
    addDependency(testDb.db, taskA.id, taskB.id)

    const result = cmdDepRemove(testDb.db, taskA.id, { on: taskB.id }, "text")
    expect(result.success).toBe(true)
    expect(result.message).toContain("Dependency removed")
    expect(result.message).toContain("no longer depends on")
  })

  test("json format returns removal info", () => {
    const taskA = createTask(testDb.db, { boardId: testDb.boardId, title: "Task A" })
    const taskB = createTask(testDb.db, { boardId: testDb.boardId, title: "Task B" })
    addDependency(testDb.db, taskA.id, taskB.id)

    const result = cmdDepRemove(testDb.db, taskA.id, { on: taskB.id }, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.taskId).toBe(taskA.id)
    expect(parsed.removed).toBe(taskB.id)
  })

  test("returns error when --on is missing", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task" })
    const result = cmdDepRemove(testDb.db, task.id, {}, "text")
    expect(result.success).toBe(false)
    expect(result.message).toContain("--on is required")
  })

  test("returns error when task ID is missing", () => {
    const result = cmdDepRemove(testDb.db, "", { on: "some-id" }, "text")
    expect(result.success).toBe(false)
    expect(result.message).toContain("Task ID is required")
  })

  test("supports partial IDs", () => {
    const taskA = createTask(testDb.db, { boardId: testDb.boardId, title: "Task A" })
    const taskB = createTask(testDb.db, { boardId: testDb.boardId, title: "Task B" })
    addDependency(testDb.db, taskA.id, taskB.id)

    const suffixA = taskA.id.slice(-8)
    const suffixB = taskB.id.slice(-8)

    const result = cmdDepRemove(testDb.db, suffixA, { on: suffixB }, "json")
    expect(result.success).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════
// cmdDepList
// ═══════════════════════════════════════════════════════════════════

describe("cmdDepList", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("lists dependencies in both directions", () => {
    const taskA = createTask(testDb.db, { boardId: testDb.boardId, title: "Task A" })
    const taskB = createTask(testDb.db, { boardId: testDb.boardId, title: "Task B" })
    const taskC = createTask(testDb.db, { boardId: testDb.boardId, title: "Task C" })

    // A depends on B, C depends on A
    addDependency(testDb.db, taskA.id, taskB.id)
    addDependency(testDb.db, taskC.id, taskA.id)

    const result = cmdDepList(testDb.db, taskA.id, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.dependsOn).toHaveLength(1)
    expect(parsed.dependsOn[0].id).toBe(taskB.id)
    expect(parsed.dependedOnBy).toHaveLength(1)
    expect(parsed.dependedOnBy[0].id).toBe(taskC.id)
  })

  test("text format shows both directions", () => {
    const taskA = createTask(testDb.db, { boardId: testDb.boardId, title: "Task A" })
    const taskB = createTask(testDb.db, { boardId: testDb.boardId, title: "Task B" })
    const taskC = createTask(testDb.db, { boardId: testDb.boardId, title: "Task C" })

    addDependency(testDb.db, taskA.id, taskB.id)
    addDependency(testDb.db, taskC.id, taskA.id)

    const result = cmdDepList(testDb.db, taskA.id, "text")
    expect(result.success).toBe(true)
    expect(result.message).toContain("Depends on:")
    expect(result.message).toContain("Task B")
    expect(result.message).toContain("Blocking:")
    expect(result.message).toContain("Task C")
  })

  test("text format shows '(none)' when no dependencies", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Lonely task" })

    const result = cmdDepList(testDb.db, task.id, "text")
    expect(result.success).toBe(true)
    expect(result.message).toContain("Depends on: (none)")
    expect(result.message).toContain("Blocking: (none)")
  })

  test("json format returns empty arrays when no dependencies", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Lonely task" })

    const result = cmdDepList(testDb.db, task.id, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.dependsOn).toEqual([])
    expect(parsed.dependedOnBy).toEqual([])
  })

  test("includes status in dependency entries (json)", () => {
    const taskA = createTask(testDb.db, { boardId: testDb.boardId, title: "Task A" })
    const taskB = createTask(testDb.db, { boardId: testDb.boardId, title: "Task B", status: "todo" })
    addDependency(testDb.db, taskA.id, taskB.id)

    const result = cmdDepList(testDb.db, taskA.id, "json")
    const parsed = JSON.parse(result.message)
    expect(parsed.dependsOn[0].status).toBe("todo")
  })

  test("text format shows done/not-done markers for dependsOn", () => {
    const taskA = createTask(testDb.db, { boardId: testDb.boardId, title: "Task A" })
    const taskB = createTask(testDb.db, { boardId: testDb.boardId, title: "Task B", status: "backlog" })
    addDependency(testDb.db, taskA.id, taskB.id)

    // taskB is not done, so should show ○
    const result = cmdDepList(testDb.db, taskA.id, "text")
    expect(result.message).toContain("○")
    expect(result.message).toContain("Task B")

    // Now complete taskB and check for ✓
    updateTaskStatus(testDb.db, taskB.id, "done")
    const result2 = cmdDepList(testDb.db, taskA.id, "text")
    expect(result2.message).toContain("✓")
  })

  test("returns error when task ID is missing", () => {
    const result = cmdDepList(testDb.db, "", "text")
    expect(result.success).toBe(false)
    expect(result.message).toContain("Task ID is required")
  })

  test("supports partial ID", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Task" })
    const suffix = task.id.slice(-8)
    const result = cmdDepList(testDb.db, suffix, "json")
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.message)
    expect(parsed.taskId).toBe(task.id)
    expect(parsed.title).toBe("Task")
  })
})
