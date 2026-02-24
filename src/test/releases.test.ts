import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { createTestDb, closeTestDb, type TestDb } from "./helpers.js"
import {
  createTask,
  updateTaskStatus,
  getTaskCards,
  getTasksByStatus,
  createRelease,
  getReleases,
  getReleaseTasks,
  getReleaseTopLevelTasks,
  getReleaseTaskSubtasks,
  restoreTaskFromRelease,
  restoreAllFromRelease,
  deleteRelease,
  getRelease,
} from "../db/queries.js"

// ═══════════════════════════════════════════════════════════════════
// createRelease
// ═══════════════════════════════════════════════════════════════════

describe("createRelease", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("creates release with name and assigns tasks", () => {
    const t1 = createTask(testDb.db, { boardId: testDb.boardId, title: "Task 1" })
    const t2 = createTask(testDb.db, { boardId: testDb.boardId, title: "Task 2" })
    updateTaskStatus(testDb.db, t1.id, "done")
    updateTaskStatus(testDb.db, t2.id, "done")

    const release = createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "v1.0.0",
      taskIds: [t1.id, t2.id],
    })

    expect(release.name).toBe("v1.0.0")
    expect(release.boardId).toBe(testDb.boardId)
    expect(release.id).toBeDefined()

    const releaseTasks = getReleaseTasks(testDb.db, release.id)
    expect(releaseTasks).toHaveLength(2)
  })

  test("creates release with description and version info", () => {
    const release = createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "v2.0.0",
      description: "Major release",
      versionInfo: { file: "package.json", oldVersion: "1.0.0", newVersion: "2.0.0" },
      taskIds: [],
    })

    expect(release.description).toBe("Major release")
    expect(release.versionInfo).toEqual({
      file: "package.json",
      oldVersion: "1.0.0",
      newVersion: "2.0.0",
    })
  })

  test("creates release with empty task list", () => {
    const release = createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "Empty Release",
      taskIds: [],
    })

    expect(release.name).toBe("Empty Release")
    const releaseTasks = getReleaseTasks(testDb.db, release.id)
    expect(releaseTasks).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Released tasks hidden from board
// ═══════════════════════════════════════════════════════════════════

describe("released tasks hidden from board", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("released tasks are excluded from getTaskCards", () => {
    const t1 = createTask(testDb.db, { boardId: testDb.boardId, title: "Released" })
    const t2 = createTask(testDb.db, { boardId: testDb.boardId, title: "Visible" })
    updateTaskStatus(testDb.db, t1.id, "done")

    createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "v1.0",
      taskIds: [t1.id],
    })

    const cards = getTaskCards(testDb.db, testDb.boardId)
    const titles = cards.map((c) => c.title)
    expect(titles).toContain("Visible")
    expect(titles).not.toContain("Released")
  })

  test("released tasks are excluded from getTasksByStatus", () => {
    const t1 = createTask(testDb.db, { boardId: testDb.boardId, title: "Released", status: "done" })
    const t2 = createTask(testDb.db, { boardId: testDb.boardId, title: "Visible", status: "done" })

    createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "v1.0",
      taskIds: [t1.id],
    })

    const statusMap = getTasksByStatus(testDb.db, testDb.boardId)
    const doneTitles = (statusMap.get("done") || []).map((t) => t.title)
    expect(doneTitles).toContain("Visible")
    expect(doneTitles).not.toContain("Released")
  })

  test("released tasks are visible with includeReleased option", () => {
    const t1 = createTask(testDb.db, { boardId: testDb.boardId, title: "Released" })
    updateTaskStatus(testDb.db, t1.id, "done")

    createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "v1.0",
      taskIds: [t1.id],
    })

    const cards = getTaskCards(testDb.db, testDb.boardId, { includeReleased: true })
    const titles = cards.map((c) => c.title)
    expect(titles).toContain("Released")
  })
})

// ═══════════════════════════════════════════════════════════════════
// getReleases
// ═══════════════════════════════════════════════════════════════════

describe("getReleases", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("returns releases with task counts, newest first", () => {
    const t1 = createTask(testDb.db, { boardId: testDb.boardId, title: "Task 1" })
    const t2 = createTask(testDb.db, { boardId: testDb.boardId, title: "Task 2" })
    const t3 = createTask(testDb.db, { boardId: testDb.boardId, title: "Task 3" })

    createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "v1.0",
      taskIds: [t1.id],
    })

    createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "v2.0",
      taskIds: [t2.id, t3.id],
    })

    const rels = getReleases(testDb.db, testDb.boardId)
    expect(rels).toHaveLength(2)
    const byName = Object.fromEntries(rels.map((r) => [r.name, r]))
    expect(byName["v1.0"].taskCount).toBe(1)
    expect(byName["v2.0"].taskCount).toBe(2)
  })

  test("returns empty array when no releases exist", () => {
    const releases = getReleases(testDb.db, testDb.boardId)
    expect(releases).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════
// restoreTaskFromRelease
// ═══════════════════════════════════════════════════════════════════

describe("restoreTaskFromRelease", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("restoring a task makes it visible on the board again", () => {
    const t1 = createTask(testDb.db, { boardId: testDb.boardId, title: "Restored task" })
    updateTaskStatus(testDb.db, t1.id, "done")

    const release = createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "v1.0",
      taskIds: [t1.id],
    })

    // Verify hidden
    let cards = getTaskCards(testDb.db, testDb.boardId)
    expect(cards.map((c) => c.title)).not.toContain("Restored task")

    // Restore
    restoreTaskFromRelease(testDb.db, t1.id)

    // Verify visible again
    cards = getTaskCards(testDb.db, testDb.boardId)
    expect(cards.map((c) => c.title)).toContain("Restored task")
  })

  test("restored task keeps its original status (done)", () => {
    const t1 = createTask(testDb.db, { boardId: testDb.boardId, title: "Task" })
    updateTaskStatus(testDb.db, t1.id, "done")

    createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "v1.0",
      taskIds: [t1.id],
    })

    restoreTaskFromRelease(testDb.db, t1.id)

    const cards = getTaskCards(testDb.db, testDb.boardId)
    const task = cards.find((c) => c.title === "Task")
    expect(task?.status).toBe("done")
  })

  test("throws when task is not in a release", () => {
    const t1 = createTask(testDb.db, { boardId: testDb.boardId, title: "Not released" })

    expect(() => restoreTaskFromRelease(testDb.db, t1.id)).toThrow("is not in a release")
  })

  test("throws when task does not exist", () => {
    expect(() => restoreTaskFromRelease(testDb.db, "nonexistent")).toThrow("not found")
  })
})

// ═══════════════════════════════════════════════════════════════════
// restoreAllFromRelease
// ═══════════════════════════════════════════════════════════════════

describe("restoreAllFromRelease", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("restores all tasks from a release and returns count", () => {
    const t1 = createTask(testDb.db, { boardId: testDb.boardId, title: "Task A" })
    const t2 = createTask(testDb.db, { boardId: testDb.boardId, title: "Task B" })
    updateTaskStatus(testDb.db, t1.id, "done")
    updateTaskStatus(testDb.db, t2.id, "done")

    const release = createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "v1.0",
      taskIds: [t1.id, t2.id],
    })

    const count = restoreAllFromRelease(testDb.db, release.id)
    expect(count).toBe(2)

    // Both tasks should be visible on the board
    const cards = getTaskCards(testDb.db, testDb.boardId)
    const titles = cards.map((c) => c.title)
    expect(titles).toContain("Task A")
    expect(titles).toContain("Task B")
  })

  test("returns 0 when release has no tasks", () => {
    const release = createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "Empty",
      taskIds: [],
    })

    const count = restoreAllFromRelease(testDb.db, release.id)
    expect(count).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════
// deleteRelease
// ═══════════════════════════════════════════════════════════════════

describe("deleteRelease", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("deletes release record and restores all tasks to board", () => {
    const t1 = createTask(testDb.db, { boardId: testDb.boardId, title: "Task A" })
    const t2 = createTask(testDb.db, { boardId: testDb.boardId, title: "Task B" })
    updateTaskStatus(testDb.db, t1.id, "done")
    updateTaskStatus(testDb.db, t2.id, "done")

    const release = createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "v1.0",
      taskIds: [t1.id, t2.id],
    })

    const count = deleteRelease(testDb.db, release.id)
    expect(count).toBe(2)

    // Release record is gone
    expect(getRelease(testDb.db, release.id)).toBeUndefined()

    // Tasks are back on the board
    const cards = getTaskCards(testDb.db, testDb.boardId)
    const titles = cards.map((c) => c.title)
    expect(titles).toContain("Task A")
    expect(titles).toContain("Task B")
  })

  test("deletes release and restores subtasks too", () => {
    const parent = createTask(testDb.db, { boardId: testDb.boardId, title: "Parent" })
    const sub = createTask(testDb.db, { boardId: testDb.boardId, title: "Subtask", parentId: parent.id })
    updateTaskStatus(testDb.db, parent.id, "done")
    updateTaskStatus(testDb.db, sub.id, "done")

    const release = createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "v1.0",
      taskIds: [parent.id],
    })

    deleteRelease(testDb.db, release.id)

    // Both parent and subtask restored
    const cards = getTaskCards(testDb.db, testDb.boardId)
    expect(cards.map((c) => c.title)).toContain("Parent")
    expect(cards.map((c) => c.title)).toContain("Subtask")
  })

  test("release no longer appears in getReleases after deletion", () => {
    const release = createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "Deleted",
      taskIds: [],
    })

    deleteRelease(testDb.db, release.id)

    const rels = getReleases(testDb.db, testDb.boardId)
    expect(rels.find((r) => r.id === release.id)).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════
// getReleaseTopLevelTasks
// ═══════════════════════════════════════════════════════════════════

describe("getReleaseTopLevelTasks", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("returns only top-level tasks, not subtasks", () => {
    const parent = createTask(testDb.db, { boardId: testDb.boardId, title: "Parent" })
    const sub = createTask(testDb.db, { boardId: testDb.boardId, title: "Subtask", parentId: parent.id })
    updateTaskStatus(testDb.db, parent.id, "done")
    updateTaskStatus(testDb.db, sub.id, "done")

    const release = createRelease(testDb.db, {
      boardId: testDb.boardId,
      name: "v1.0",
      taskIds: [parent.id],
    })

    const topLevel = getReleaseTopLevelTasks(testDb.db, release.id)
    expect(topLevel).toHaveLength(1)
    expect(topLevel[0].title).toBe("Parent")
  })
})

// ═══════════════════════════════════════════════════════════════════
// getReleaseTaskSubtasks
// ═══════════════════════════════════════════════════════════════════

describe("getReleaseTaskSubtasks", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("returns subtasks of a given task", () => {
    const parent = createTask(testDb.db, { boardId: testDb.boardId, title: "Parent" })
    const sub1 = createTask(testDb.db, { boardId: testDb.boardId, title: "Sub 1", parentId: parent.id })
    const sub2 = createTask(testDb.db, { boardId: testDb.boardId, title: "Sub 2", parentId: parent.id })

    const subtasks = getReleaseTaskSubtasks(testDb.db, parent.id)
    expect(subtasks).toHaveLength(2)
    const titles = subtasks.map((t) => t.title)
    expect(titles).toContain("Sub 1")
    expect(titles).toContain("Sub 2")
  })

  test("returns empty array when task has no subtasks", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Solo" })
    const subtasks = getReleaseTaskSubtasks(testDb.db, task.id)
    expect(subtasks).toHaveLength(0)
  })
})
