import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { createTestDb, closeTestDb, type TestDb } from "./helpers.js"
import { createTask, updateTaskStatus, countTasksInLane } from "../db/queries.js"
import type { LanePolicies } from "../lib/config.js"
import {
  getLanePolicy,
  getVisibleLanes,
  validateTaskCreation,
  validateTaskMove,
} from "../lib/lane-policy.js"

// ═══════════════════════════════════════════════════════════════════
// Lane Policy — Pure Functions
// ═══════════════════════════════════════════════════════════════════

describe("getLanePolicy", () => {
  test("returns default policy when no policies configured", () => {
    const policy = getLanePolicy(undefined, "backlog")
    expect(policy).toEqual({ visible: true })
  })

  test("returns default policy for unconfigured lane", () => {
    const policies: LanePolicies = { in_progress: { wipLimit: 3 } }
    const policy = getLanePolicy(policies, "backlog")
    expect(policy).toEqual({ visible: true })
  })

  test("returns configured policy for lane", () => {
    const policies: LanePolicies = { in_progress: { wipLimit: 3, visible: true } }
    const policy = getLanePolicy(policies, "in_progress")
    expect(policy).toEqual({ wipLimit: 3, visible: true })
  })
})

describe("getVisibleLanes", () => {
  test("returns all VISIBLE_STATUSES when no policies configured", () => {
    const lanes = getVisibleLanes(undefined)
    expect(lanes).toEqual(["backlog", "todo", "in_progress", "in_review", "done"])
  })

  test("filters out hidden lanes", () => {
    const policies: LanePolicies = {
      backlog: { visible: false },
      in_review: { visible: false },
    }
    const lanes = getVisibleLanes(policies)
    expect(lanes).toEqual(["todo", "in_progress", "done"])
  })

  test("keeps lanes with explicit visible: true", () => {
    const policies: LanePolicies = {
      backlog: { visible: true },
      todo: { visible: false },
    }
    const lanes = getVisibleLanes(policies)
    expect(lanes).toEqual(["backlog", "in_progress", "in_review", "done"])
  })
})

describe("validateTaskCreation", () => {
  test("allows creation when no policies configured", () => {
    expect(validateTaskCreation(undefined, "backlog", 5)).toBeNull()
  })

  test("blocks creation in hidden lane", () => {
    const policies: LanePolicies = { done: { visible: false } }
    const result = validateTaskCreation(policies, "done", 0)
    expect(result).not.toBeNull()
    expect(result!.kind).toBe("hidden_lane")
    expect(result!.message).toContain("hidden lane")
  })

  test("blocks creation when WIP limit reached", () => {
    const policies: LanePolicies = { in_progress: { wipLimit: 3 } }
    const result = validateTaskCreation(policies, "in_progress", 3)
    expect(result).not.toBeNull()
    expect(result!.kind).toBe("wip_limit")
    expect(result!.message).toContain("WIP limit")
  })

  test("allows creation when under WIP limit", () => {
    const policies: LanePolicies = { in_progress: { wipLimit: 3 } }
    expect(validateTaskCreation(policies, "in_progress", 2)).toBeNull()
  })

  test("allows creation in lane without policy", () => {
    const policies: LanePolicies = { in_progress: { wipLimit: 3 } }
    expect(validateTaskCreation(policies, "backlog", 100)).toBeNull()
  })
})

describe("validateTaskMove", () => {
  test("allows move when no policies configured", () => {
    expect(validateTaskMove(undefined, "done", 50)).toBeNull()
  })

  test("blocks move when WIP limit reached", () => {
    const policies: LanePolicies = { in_progress: { wipLimit: 2 } }
    const result = validateTaskMove(policies, "in_progress", 2)
    expect(result).not.toBeNull()
    expect(result!.kind).toBe("wip_limit")
  })

  test("allows move into hidden lane (moves are not blocked by visibility)", () => {
    const policies: LanePolicies = { done: { visible: false } }
    expect(validateTaskMove(policies, "done", 0)).toBeNull()
  })

  test("allows move when under WIP limit", () => {
    const policies: LanePolicies = { in_progress: { wipLimit: 5 } }
    expect(validateTaskMove(policies, "in_progress", 4)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════
// Lane Policy — DB Integration
// ═══════════════════════════════════════════════════════════════════

describe("countTasksInLane", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("returns 0 for empty lane", () => {
    expect(countTasksInLane(testDb.db, testDb.boardId, "in_progress")).toBe(0)
  })

  test("counts tasks in lane correctly", () => {
    createTask(testDb.db, { boardId: testDb.boardId, title: "A", status: "in_progress" })
    createTask(testDb.db, { boardId: testDb.boardId, title: "B", status: "in_progress" })
    createTask(testDb.db, { boardId: testDb.boardId, title: "C", status: "todo" })
    expect(countTasksInLane(testDb.db, testDb.boardId, "in_progress")).toBe(2)
    expect(countTasksInLane(testDb.db, testDb.boardId, "todo")).toBe(1)
  })
})

describe("createTask with lane policies", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("rejects creation in hidden lane", () => {
    const policies: LanePolicies = { done: { visible: false } }
    expect(() =>
      createTask(testDb.db, {
        boardId: testDb.boardId,
        title: "Should fail",
        status: "done",
        lanePolicies: policies,
      }),
    ).toThrow("hidden lane")
  })

  test("rejects creation when WIP limit reached", () => {
    const policies: LanePolicies = { in_progress: { wipLimit: 1 } }
    createTask(testDb.db, { boardId: testDb.boardId, title: "First", status: "in_progress" })

    expect(() =>
      createTask(testDb.db, {
        boardId: testDb.boardId,
        title: "Second",
        status: "in_progress",
        lanePolicies: policies,
      }),
    ).toThrow("WIP limit")
  })

  test("allows creation when under WIP limit", () => {
    const policies: LanePolicies = { in_progress: { wipLimit: 2 } }
    createTask(testDb.db, { boardId: testDb.boardId, title: "First", status: "in_progress" })

    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Second",
      status: "in_progress",
      lanePolicies: policies,
    })
    expect(task.title).toBe("Second")
    expect(task.status).toBe("in_progress")
  })

  test("allows creation without policies (backward compatible)", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "No policies",
      status: "done",
    })
    expect(task.status).toBe("done")
  })
})

describe("updateTaskStatus with lane policies", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("rejects move when WIP limit reached", () => {
    const policies: LanePolicies = { in_progress: { wipLimit: 1 } }
    createTask(testDb.db, { boardId: testDb.boardId, title: "Existing", status: "in_progress" })
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Mover", status: "todo" })

    expect(() =>
      updateTaskStatus(testDb.db, task.id, "in_progress", policies),
    ).toThrow("WIP limit")
  })

  test("allows move when under WIP limit", () => {
    const policies: LanePolicies = { in_progress: { wipLimit: 2 } }
    createTask(testDb.db, { boardId: testDb.boardId, title: "Existing", status: "in_progress" })
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Mover", status: "todo" })

    updateTaskStatus(testDb.db, task.id, "in_progress", policies)
    // Should not throw
  })

  test("allows move into hidden lane (visibility does not block moves)", () => {
    const policies: LanePolicies = { done: { visible: false } }
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Mover", status: "todo" })

    updateTaskStatus(testDb.db, task.id, "done", policies)
    // Should not throw
  })

  test("allows move without policies (backward compatible)", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Mover", status: "todo" })
    updateTaskStatus(testDb.db, task.id, "in_progress")
    // Should not throw
  })
})
