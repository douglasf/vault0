import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { createTestDb, closeTestDb, type TestDb } from "./helpers.js"
import {
  cmdList,
  cmdAdd,
  cmdView,
  cmdMove,
  cmdEdit,
  cmdSubtasks,
} from "../cli/commands.js"
import type { CommandResult } from "../cli/commands.js"

// ── Helpers ─────────────────────────────────────────────────────────────

/** Simulate MCP tool handler: convert args to flags and call the command */
function toolList(db: TestDb["db"], args: Record<string, unknown>): CommandResult {
  const flags: Record<string, string> = {}
  if (args.status) flags.status = args.status as string
  if (args.priority) flags.priority = args.priority as string
  if (args.search) flags.search = args.search as string
  if (args.blocked) flags.blocked = "true"
  if (args.ready) flags.ready = "true"
  return cmdList(db, flags, "json")
}

function toolAdd(db: TestDb["db"], args: Record<string, unknown>): CommandResult {
  const flags: Record<string, string> = { title: args.title as string }
  if (args.description) flags.description = args.description as string
  if (args.priority) flags.priority = args.priority as string
  if (args.status) flags.status = args.status as string
  if (args.parent) flags.parent = args.parent as string
  if (args.sourceFlag) flags.source = args.sourceFlag as string
  if (args.type) flags.type = args.type as string
  if (args.tags) flags.tags = args.tags as string
  return cmdAdd(db, flags, "json")
}

function toolView(db: TestDb["db"], id: string): CommandResult {
  return cmdView(db, id, "json")
}

function toolMove(db: TestDb["db"], id: string, status: string, solution?: string): CommandResult {
  const flags: Record<string, string> = { status }
  if (solution !== undefined) flags.solution = solution
  return cmdMove(db, id, flags, "json")
}

function toolUpdate(db: TestDb["db"], id: string, args: Record<string, unknown>): CommandResult {
  const flags: Record<string, string> = {}
  if (args.title) flags.title = args.title as string
  if (args.description !== undefined) flags.description = args.description as string
  if (args.priority) flags.priority = args.priority as string
  if (args.tags !== undefined) flags.tags = args.tags as string
  if (args.type) flags.type = args.type as string
  if (args.solution !== undefined) flags.solution = args.solution as string
  if (args.depAdd) flags["dep-add"] = args.depAdd as string
  if (args.depRemove) flags["dep-remove"] = args.depRemove as string
  return cmdEdit(db, id, flags, "json")
}

function toolSubtasks(db: TestDb["db"], id: string, ready?: boolean): CommandResult {
  const flags: Record<string, string> = {}
  if (ready) flags.ready = "true"
  return cmdSubtasks(db, id, flags, "json")
}

function toolComplete(db: TestDb["db"], id: string, solution?: string): CommandResult {
  const flags: Record<string, string> = { status: "done" }
  if (solution !== undefined) flags.solution = solution
  return cmdMove(db, id, flags, "json")
}

// ═══════════════════════════════════════════════════════════════════
// vault0-task-add
// ═══════════════════════════════════════════════════════════════════

describe("vault0-task-add", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("creates a task with title only", () => {
    const result = toolAdd(testDb.db, { title: "New task" })
    expect(result.success).toBe(true)
    const data = result.data as Record<string, unknown>
    expect(data.title).toBe("New task")
    expect(data.status).toBe("backlog")
    expect(data.priority).toBe("normal")
  })

  test("creates a task with all optional fields", () => {
    const result = toolAdd(testDb.db, {
      title: "Full task",
      description: "A description",
      priority: "high",
      status: "todo",
      sourceFlag: "opencode-plan",
      type: "feature",
      tags: "ui,backend",
    })
    expect(result.success).toBe(true)
    const data = result.data as Record<string, unknown>
    expect(data.title).toBe("Full task")
    expect(data.priority).toBe("high")
    expect(data.status).toBe("todo")
    expect(data.source).toBe("opencode-plan")
    expect(data.type).toBe("feature")
    expect(data.tags).toEqual(["ui", "backend"])
  })

  test("creates subtask with parent ID", () => {
    const parent = toolAdd(testDb.db, { title: "Parent" })
    const parentId = (parent.data as Record<string, unknown>).id as string

    const child = toolAdd(testDb.db, { title: "Child", parent: parentId })
    expect(child.success).toBe(true)
    expect((child.data as Record<string, unknown>).parentId).toBe(parentId)
  })

  test("fails when title is missing", () => {
    const result = cmdAdd(testDb.db, {}, "json")
    expect(result.success).toBe(false)
  })

  test("fails with invalid priority", () => {
    expect(() => toolAdd(testDb.db, { title: "Bad", priority: "ultra" })).toThrow()
  })

  test("fails with invalid status", () => {
    expect(() => toolAdd(testDb.db, { title: "Bad", status: "running" })).toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════
// vault0-task-list
// ═══════════════════════════════════════════════════════════════════

describe("vault0-task-list", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("returns empty array when no tasks exist", () => {
    const result = toolList(testDb.db, {})
    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  test("returns created tasks", () => {
    toolAdd(testDb.db, { title: "Task A" })
    toolAdd(testDb.db, { title: "Task B" })
    const result = toolList(testDb.db, {})
    expect(result.success).toBe(true)
    expect((result.data as unknown[]).length).toBe(2)
  })

  test("filters by status", () => {
    toolAdd(testDb.db, { title: "Backlog task" })
    toolAdd(testDb.db, { title: "Todo task", status: "todo" })
    const result = toolList(testDb.db, { status: "todo" })
    const data = result.data as Array<Record<string, unknown>>
    expect(data.length).toBe(1)
    expect(data[0].title).toBe("Todo task")
  })

  test("filters by priority", () => {
    toolAdd(testDb.db, { title: "Normal" })
    toolAdd(testDb.db, { title: "Critical", priority: "critical" })
    const result = toolList(testDb.db, { priority: "critical" })
    const data = result.data as Array<Record<string, unknown>>
    expect(data.length).toBe(1)
    expect(data[0].title).toBe("Critical")
  })

  test("filters by search term", () => {
    toolAdd(testDb.db, { title: "Fix login bug" })
    toolAdd(testDb.db, { title: "Add feature" })
    const result = toolList(testDb.db, { search: "login" })
    const data = result.data as Array<Record<string, unknown>>
    expect(data.length).toBe(1)
    expect(data[0].title).toBe("Fix login bug")
  })

  test("filters by ready flag", () => {
    const parent = toolAdd(testDb.db, { title: "Parent" })
    const parentId = (parent.data as Record<string, unknown>).id as string
    toolAdd(testDb.db, { title: "Child A", parent: parentId })
    const childB = toolAdd(testDb.db, { title: "Child B", parent: parentId })
    const childBId = (childB.data as Record<string, unknown>).id as string

    // Add dependency: B depends on A — so B is blocked
    const childA = toolList(testDb.db, { search: "Child A" })
    const childAId = ((childA.data as Array<Record<string, unknown>>)[0]).id as string
    toolUpdate(testDb.db, childBId, { depAdd: childAId })

    // Only A should be ready (not blocked, not done)
    const readyResult = toolList(testDb.db, { ready: true })
    const readyData = readyResult.data as Array<Record<string, unknown>>
    const readyTitles = readyData.map(t => t.title)
    expect(readyTitles).toContain("Child A")
    expect(readyTitles).not.toContain("Child B")
  })

  test("returns both parent and child tasks in list", () => {
    const parent = toolAdd(testDb.db, { title: "Parent" })
    const parentId = (parent.data as Record<string, unknown>).id as string
    toolAdd(testDb.db, { title: "Child", parent: parentId })

    const result = toolList(testDb.db, {})
    const data = result.data as Array<Record<string, unknown>>
    const titles = data.map(t => t.title)
    expect(titles).toContain("Parent")
    expect(titles).toContain("Child")
  })
})

// ═══════════════════════════════════════════════════════════════════
// vault0-task-view
// ═══════════════════════════════════════════════════════════════════

describe("vault0-task-view", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("returns task detail by full ID", () => {
    const added = toolAdd(testDb.db, { title: "View me", description: "Details here" })
    const id = (added.data as Record<string, unknown>).id as string

    const result = toolView(testDb.db, id)
    expect(result.success).toBe(true)
    const data = result.data as Record<string, unknown>
    expect(data.title).toBe("View me")
    expect(data.description).toBe("Details here")
  })

  test("returns task detail by ID suffix", () => {
    const added = toolAdd(testDb.db, { title: "Suffix match" })
    const id = (added.data as Record<string, unknown>).id as string
    const suffix = id.slice(-8)

    const result = toolView(testDb.db, suffix)
    expect(result.success).toBe(true)
    expect((result.data as Record<string, unknown>).title).toBe("Suffix match")
  })

  test("fails for nonexistent task", () => {
    expect(() => toolView(testDb.db, "NONEXISTENT")).toThrow()
  })

  test("includes subtasks in detail", () => {
    const parent = toolAdd(testDb.db, { title: "Parent" })
    const parentId = (parent.data as Record<string, unknown>).id as string
    toolAdd(testDb.db, { title: "Child 1", parent: parentId })
    toolAdd(testDb.db, { title: "Child 2", parent: parentId })

    const detail = toolView(testDb.db, parentId)
    const data = detail.data as Record<string, unknown>
    const subtasks = data.subtasks as unknown[]
    expect(subtasks.length).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════════
// vault0-task-move
// ═══════════════════════════════════════════════════════════════════

describe("vault0-task-move", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("moves task to new status", () => {
    const added = toolAdd(testDb.db, { title: "Move me" })
    const id = (added.data as Record<string, unknown>).id as string

    const result = toolMove(testDb.db, id, "in_progress")
    expect(result.success).toBe(true)
    expect((result.data as Record<string, unknown>).status).toBe("in_progress")
  })

  test("moves task with solution", () => {
    const added = toolAdd(testDb.db, { title: "With solution" })
    const id = (added.data as Record<string, unknown>).id as string

    toolMove(testDb.db, id, "in_review", "Fixed the bug")
    const detail = toolView(testDb.db, id)
    expect((detail.data as Record<string, unknown>).solution).toBe("Fixed the bug")
  })

  test("fails without status flag", () => {
    const added = toolAdd(testDb.db, { title: "No status" })
    const id = (added.data as Record<string, unknown>).id as string

    const result = cmdMove(testDb.db, id, {}, "json")
    expect(result.success).toBe(false)
  })

  test("fails with invalid status", () => {
    const added = toolAdd(testDb.db, { title: "Bad status" })
    const id = (added.data as Record<string, unknown>).id as string

    expect(() => toolMove(testDb.db, id, "running")).toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════
// vault0-task-update
// ═══════════════════════════════════════════════════════════════════

describe("vault0-task-update", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("updates title", () => {
    const added = toolAdd(testDb.db, { title: "Original" })
    const id = (added.data as Record<string, unknown>).id as string

    const result = toolUpdate(testDb.db, id, { title: "Updated" })
    expect(result.success).toBe(true)
    expect((result.data as Record<string, unknown>).title).toBe("Updated")
  })

  test("updates priority", () => {
    const added = toolAdd(testDb.db, { title: "Prio task" })
    const id = (added.data as Record<string, unknown>).id as string

    toolUpdate(testDb.db, id, { priority: "critical" })
    const detail = toolView(testDb.db, id)
    expect((detail.data as Record<string, unknown>).priority).toBe("critical")
  })

  test("adds dependency", () => {
    const taskA = toolAdd(testDb.db, { title: "Task A" })
    const taskB = toolAdd(testDb.db, { title: "Task B" })
    const idA = (taskA.data as Record<string, unknown>).id as string
    const idB = (taskB.data as Record<string, unknown>).id as string

    const result = toolUpdate(testDb.db, idB, { depAdd: idA })
    expect(result.success).toBe(true)

    const detail = toolView(testDb.db, idB)
    const deps = (detail.data as Record<string, unknown>).dependsOn as Array<Record<string, unknown>>
    expect(deps.length).toBe(1)
    expect(deps[0].id).toBe(idA)
  })

  test("removes dependency", () => {
    const taskA = toolAdd(testDb.db, { title: "Task A" })
    const taskB = toolAdd(testDb.db, { title: "Task B" })
    const idA = (taskA.data as Record<string, unknown>).id as string
    const idB = (taskB.data as Record<string, unknown>).id as string

    toolUpdate(testDb.db, idB, { depAdd: idA })
    toolUpdate(testDb.db, idB, { depRemove: idA })

    const detail = toolView(testDb.db, idB)
    const deps = (detail.data as Record<string, unknown>).dependsOn as Array<Record<string, unknown>>
    expect(deps.length).toBe(0)
  })

  test("fails with no update fields", () => {
    const added = toolAdd(testDb.db, { title: "No updates" })
    const id = (added.data as Record<string, unknown>).id as string

    const result = toolUpdate(testDb.db, id, {})
    expect(result.success).toBe(false)
  })

  test("updates solution field", () => {
    const added = toolAdd(testDb.db, { title: "Solution task" })
    const id = (added.data as Record<string, unknown>).id as string

    toolUpdate(testDb.db, id, { solution: "Resolved via commit abc123" })
    const detail = toolView(testDb.db, id)
    expect((detail.data as Record<string, unknown>).solution).toBe("Resolved via commit abc123")
  })
})

// ═══════════════════════════════════════════════════════════════════
// vault0-task-subtasks
// ═══════════════════════════════════════════════════════════════════

describe("vault0-task-subtasks", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("returns subtasks of a parent", () => {
    const parent = toolAdd(testDb.db, { title: "Parent" })
    const parentId = (parent.data as Record<string, unknown>).id as string
    toolAdd(testDb.db, { title: "Sub 1", parent: parentId })
    toolAdd(testDb.db, { title: "Sub 2", parent: parentId })

    const result = toolSubtasks(testDb.db, parentId)
    expect(result.success).toBe(true)
    const data = result.data as unknown[]
    expect(data.length).toBe(2)
  })

  test("returns empty array when no subtasks", () => {
    const task = toolAdd(testDb.db, { title: "No kids" })
    const id = (task.data as Record<string, unknown>).id as string

    const result = toolSubtasks(testDb.db, id)
    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  test("filters to ready subtasks only", () => {
    const parent = toolAdd(testDb.db, { title: "Parent" })
    const parentId = (parent.data as Record<string, unknown>).id as string
    const subA = toolAdd(testDb.db, { title: "Sub A", parent: parentId })
    const subB = toolAdd(testDb.db, { title: "Sub B", parent: parentId })
    const subAId = (subA.data as Record<string, unknown>).id as string
    const subBId = (subB.data as Record<string, unknown>).id as string

    // B depends on A — B is blocked
    toolUpdate(testDb.db, subBId, { depAdd: subAId })

    const result = toolSubtasks(testDb.db, parentId, true)
    const data = result.data as Array<Record<string, unknown>>
    const titles = data.map(t => t.title)
    expect(titles).toContain("Sub A")
    expect(titles).not.toContain("Sub B")
  })
})

// ═══════════════════════════════════════════════════════════════════
// vault0-task-complete
// ═══════════════════════════════════════════════════════════════════

describe("vault0-task-complete", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("moves task to done", () => {
    const added = toolAdd(testDb.db, { title: "Complete me" })
    const id = (added.data as Record<string, unknown>).id as string

    const result = toolComplete(testDb.db, id)
    expect(result.success).toBe(true)
    expect((result.data as Record<string, unknown>).status).toBe("done")
  })

  test("moves task to done with solution", () => {
    const added = toolAdd(testDb.db, { title: "Done with solution" })
    const id = (added.data as Record<string, unknown>).id as string

    toolComplete(testDb.db, id, "Fixed in commit abc123")
    const detail = toolView(testDb.db, id)
    expect((detail.data as Record<string, unknown>).solution).toBe("Fixed in commit abc123")
    expect((detail.data as Record<string, unknown>).status).toBe("done")
  })

  test("auto-completes parent when all subtasks done", () => {
    const parent = toolAdd(testDb.db, { title: "Parent" })
    const parentId = (parent.data as Record<string, unknown>).id as string
    const sub1 = toolAdd(testDb.db, { title: "Sub 1", parent: parentId })
    const sub2 = toolAdd(testDb.db, { title: "Sub 2", parent: parentId })
    const sub1Id = (sub1.data as Record<string, unknown>).id as string
    const sub2Id = (sub2.data as Record<string, unknown>).id as string

    toolComplete(testDb.db, sub1Id)
    toolComplete(testDb.db, sub2Id)

    const parentDetail = toolView(testDb.db, parentId)
    expect((parentDetail.data as Record<string, unknown>).status).toBe("done")
  })
})
