import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { createTestDb, closeTestDb, type TestDb } from "./helpers.js"
import { tasks, taskDependencies, taskStatusHistory } from "../db/schema.js"
import { eq } from "drizzle-orm"
import {
  createTask,
  updateTask,
  updateTaskStatus,
  getTaskCards,
  archiveTask,
  addDependency,
  removeDependency,
  getTaskDetail,
  archiveDoneTasks,
  unarchiveTask,
} from "../db/queries.js"

// ═══════════════════════════════════════════════════════════════════
// createTask
// ═══════════════════════════════════════════════════════════════════

describe("createTask", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("creates task with correct defaults (status=backlog, priority=normal)", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Default task",
    })

    expect(task.title).toBe("Default task")
    expect(task.status).toBe("backlog")
    expect(task.priority).toBe("normal")
    expect(task.source).toBe("manual")
    expect(task.boardId).toBe(testDb.boardId)
    expect(task.parentId).toBeNull()
    expect(task.description).toBeNull()
    expect(task.archivedAt).toBeNull()
    expect(task.id).toBeDefined()
  })

  test("respects provided status and priority", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Custom task",
      status: "todo",
      priority: "high",
      description: "A description",
      source: "opencode",
      sourceRef: "ref-123",
    })

    expect(task.status).toBe("todo")
    expect(task.priority).toBe("high")
    expect(task.description).toBe("A description")
    expect(task.source).toBe("opencode")
    expect(task.sourceRef).toBe("ref-123")
  })

  test("records initial status history entry (fromStatus=null)", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task with history",
    })

    const history = testDb.db
      .select()
      .from(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, task.id))
      .all()

    expect(history).toHaveLength(1)
    expect(history[0].fromStatus).toBeNull()
    expect(history[0].toStatus).toBe("backlog")
    expect(history[0].taskId).toBe(task.id)
  })

  test("records correct initial status in history when custom status provided", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Todo task",
      status: "todo",
    })

    const history = testDb.db
      .select()
      .from(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, task.id))
      .all()

    expect(history).toHaveLength(1)
    expect(history[0].fromStatus).toBeNull()
    expect(history[0].toStatus).toBe("todo")
  })

  test("allows creating subtask of a top-level task", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Parent",
    })

    const child = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child",
    })

    expect(child.parentId).toBe(parent.id)
    expect(child.title).toBe("Child")
  })

  test("rejects creating subtask of a subtask (nesting depth limit)", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Parent",
    })

    const child = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child",
    })

    expect(() => {
      createTask(testDb.db, {
        boardId: testDb.boardId,
        parentId: child.id,
        title: "Grandchild",
      })
    }).toThrow("Cannot add a subtask to a subtask")
  })

  test("throws if parent task not found", () => {
    expect(() => {
      createTask(testDb.db, {
        boardId: testDb.boardId,
        parentId: "nonexistent-id",
        title: "Orphan",
      })
    }).toThrow("not found")
  })
})

// ═══════════════════════════════════════════════════════════════════
// updateTask
// ═══════════════════════════════════════════════════════════════════

describe("updateTask", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("updates title", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Original",
    })

    const updated = updateTask(testDb.db, task.id, { title: "Updated" })
    expect(updated?.title).toBe("Updated")
  })

  test("updates description", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task",
    })

    const updated = updateTask(testDb.db, task.id, { description: "New description" })
    expect(updated?.description).toBe("New description")
  })

  test("updates priority", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task",
    })

    const updated = updateTask(testDb.db, task.id, { priority: "critical" })
    expect(updated?.priority).toBe("critical")
  })

  test("updates tags", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task",
    })

    const updated = updateTask(testDb.db, task.id, { tags: ["frontend", "bug"] })
    expect(updated?.tags).toEqual(["frontend", "bug"])
  })

  test("sets updatedAt timestamp", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task",
    })

    const before = task.updatedAt
    // Small delay to ensure timestamp changes
    const updated = updateTask(testDb.db, task.id, { title: "Changed" })
    expect(updated?.updatedAt).toBeDefined()
    // updatedAt should be a Date that was just set (we can't guarantee it's strictly > before
    // in the same millisecond, but it should be set)
    expect(updated?.updatedAt).toBeInstanceOf(Date)
  })

  test("throws if task not found", () => {
    expect(() => {
      updateTask(testDb.db, "nonexistent-id", { title: "Nope" })
    }).toThrow("not found")
  })

  test("throws if task is archived", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task",
    })

    // Archive the task
    archiveTask(testDb.db, task.id)

    expect(() => {
      updateTask(testDb.db, task.id, { title: "Nope" })
    }).toThrow("archived")
  })
})

// ═══════════════════════════════════════════════════════════════════
// updateTaskStatus
// ═══════════════════════════════════════════════════════════════════

describe("updateTaskStatus", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("transitions status and records history", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task",
      status: "backlog",
    })

    updateTaskStatus(testDb.db, task.id, "todo")

    const updated = testDb.db.select().from(tasks).where(eq(tasks.id, task.id)).get()
    expect(updated?.status).toBe("todo")

    const history = testDb.db
      .select()
      .from(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, task.id))
      .all()

    // Initial (null→backlog) + transition (backlog→todo)
    expect(history).toHaveLength(2)
    const transition = history.find((h) => h.fromStatus === "backlog")
    expect(transition).toBeDefined()
    expect(transition?.toStatus).toBe("todo")
  })

  test("cascades to subtasks in the SAME lane (old status matches)", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Parent",
      status: "backlog",
    })

    const child1 = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child 1",
      status: "backlog",
    })

    const child2 = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child 2",
      status: "backlog",
    })

    // Move parent from backlog to todo — children in same lane should follow
    updateTaskStatus(testDb.db, parent.id, "todo")

    const updatedChild1 = testDb.db.select().from(tasks).where(eq(tasks.id, child1.id)).get()
    const updatedChild2 = testDb.db.select().from(tasks).where(eq(tasks.id, child2.id)).get()

    expect(updatedChild1?.status).toBe("todo")
    expect(updatedChild2?.status).toBe("todo")
  })

  test("does NOT cascade to subtasks in a different lane", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Parent",
      status: "backlog",
    })

    // Create both children BEFORE moving one to done — prevents parent auto-complete
    const doneChild = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Done Child",
      status: "backlog",
    })

    const backlogChild = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Backlog Child",
      status: "backlog",
    })

    // Move doneChild to "done" — parent stays backlog since backlogChild is still backlog
    updateTaskStatus(testDb.db, doneChild.id, "done")

    // Move parent from backlog to todo
    updateTaskStatus(testDb.db, parent.id, "todo")

    // "Done Child" should remain done (different lane from parent's old status "backlog")
    const updatedDoneChild = testDb.db.select().from(tasks).where(eq(tasks.id, doneChild.id)).get()
    expect(updatedDoneChild?.status).toBe("done")

    // "Backlog Child" was in same lane as parent's old status, should follow to todo
    const updatedBacklogChild = testDb.db.select().from(tasks).where(eq(tasks.id, backlogChild.id)).get()
    expect(updatedBacklogChild?.status).toBe("todo")
  })

  test("auto-completes parent when all subtasks move to done", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Parent",
      status: "in_progress",
    })

    const child1 = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child 1",
      status: "in_progress",
    })

    const child2 = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child 2",
      status: "in_progress",
    })

    // Move child1 to done first
    updateTaskStatus(testDb.db, child1.id, "done")

    // Parent should NOT auto-complete yet
    let parentTask = testDb.db.select().from(tasks).where(eq(tasks.id, parent.id)).get()
    expect(parentTask?.status).toBe("in_progress")

    // Move child2 to done — now all subtasks are done
    const result = updateTaskStatus(testDb.db, child2.id, "done")

    // Parent should auto-complete
    parentTask = testDb.db.select().from(tasks).where(eq(tasks.id, parent.id)).get()
    expect(parentTask?.status).toBe("done")
    expect(result.parentAutoCompleted).toBeDefined()
    expect(result.parentAutoCompleted?.id).toBe(parent.id)
    expect(result.parentAutoCompleted?.title).toBe("Parent")
  })

  test("does NOT auto-complete parent if any subtask is not done", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Parent",
      status: "in_progress",
    })

    const child1 = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child 1",
      status: "in_progress",
    })

    createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child 2",
      status: "in_progress",
    })

    // Move child1 to done, but child2 is still in_progress
    const result = updateTaskStatus(testDb.db, child1.id, "done")

    const parentTask = testDb.db.select().from(tasks).where(eq(tasks.id, parent.id)).get()
    expect(parentTask?.status).toBe("in_progress")
    expect(result.parentAutoCompleted).toBeUndefined()
  })

  test("throws if task not found", () => {
    expect(() => {
      updateTaskStatus(testDb.db, "nonexistent-id", "todo")
    }).toThrow("not found")
  })

  test("throws if task is archived", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task",
    })

    archiveTask(testDb.db, task.id)

    expect(() => {
      updateTaskStatus(testDb.db, task.id, "todo")
    }).toThrow("archived")
  })

  test("cascading records status history for each affected subtask", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Parent",
      status: "backlog",
    })

    const child = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child",
      status: "backlog",
    })

    updateTaskStatus(testDb.db, parent.id, "todo")

    const childHistory = testDb.db
      .select()
      .from(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, child.id))
      .all()

    // Initial (null→backlog) + cascade (backlog→todo)
    expect(childHistory).toHaveLength(2)
    const cascadeEntry = childHistory.find((h) => h.fromStatus === "backlog" && h.toStatus === "todo")
    expect(cascadeEntry).toBeDefined()
  })

  test("auto-complete records status history for parent", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Parent",
      status: "in_progress",
    })

    const child = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Only Child",
      status: "in_progress",
    })

    updateTaskStatus(testDb.db, child.id, "done")

    const parentHistory = testDb.db
      .select()
      .from(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, parent.id))
      .all()

    // Initial (null→in_progress) + auto-complete (in_progress→done)
    expect(parentHistory).toHaveLength(2)
    const autoComplete = parentHistory.find((h) => h.fromStatus === "in_progress" && h.toStatus === "done")
    expect(autoComplete).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════════
// getTaskCards
// ═══════════════════════════════════════════════════════════════════

describe("getTaskCards", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("returns enriched cards with dependency/blocker counts", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
      status: "backlog",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
      status: "backlog",
    })

    // A depends on B (B is not done, so A is blocked)
    addDependency(testDb.db, taskA.id, taskB.id)

    const cards = getTaskCards(testDb.db, testDb.boardId)
    const cardA = cards.find((c) => c.id === taskA.id)

    expect(cardA).toBeDefined()
    expect(cardA?.dependencyCount).toBe(1)
    expect(cardA?.blockerCount).toBe(1)
  })

  test("isBlocked is true when dependency is not done", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
      status: "backlog",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
      status: "todo",
    })

    addDependency(testDb.db, taskA.id, taskB.id)

    const cards = getTaskCards(testDb.db, testDb.boardId)
    const cardA = cards.find((c) => c.id === taskA.id)

    expect(cardA?.isBlocked).toBe(true)
  })

  test("isBlocked is false when dependency is done", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
      status: "backlog",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
      status: "backlog",
    })

    addDependency(testDb.db, taskA.id, taskB.id)

    // Complete B
    updateTaskStatus(testDb.db, taskB.id, "done")

    const cards = getTaskCards(testDb.db, testDb.boardId)
    const cardA = cards.find((c) => c.id === taskA.id)

    expect(cardA?.isBlocked).toBe(false)
    expect(cardA?.blockerCount).toBe(0)
  })

  test("isBlocked is false when dependency is in_review", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
      status: "backlog",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
      status: "backlog",
    })

    addDependency(testDb.db, taskA.id, taskB.id)

    // Move B to in_review — should unblock A
    updateTaskStatus(testDb.db, taskB.id, "in_review")

    const cards = getTaskCards(testDb.db, testDb.boardId)
    const cardA = cards.find((c) => c.id === taskA.id)

    expect(cardA?.isBlocked).toBe(false)
    expect(cardA?.blockerCount).toBe(0)
  })

  test("isBlocked is reinstated when dependency moves back from in_review", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
      status: "backlog",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
      status: "backlog",
    })

    addDependency(testDb.db, taskA.id, taskB.id)

    // Move B to in_review — unblocks A
    updateTaskStatus(testDb.db, taskB.id, "in_review")
    let cards = getTaskCards(testDb.db, testDb.boardId)
    let cardA = cards.find((c) => c.id === taskA.id)
    expect(cardA?.isBlocked).toBe(false)

    // Move B back to in_progress — should re-block A
    updateTaskStatus(testDb.db, taskB.id, "in_progress")
    cards = getTaskCards(testDb.db, testDb.boardId)
    cardA = cards.find((c) => c.id === taskA.id)
    expect(cardA?.isBlocked).toBe(true)
    expect(cardA?.blockerCount).toBe(1)
  })

  test("isReady is true when no blockers AND status is backlog/todo", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Ready task",
      status: "backlog",
    })

    const cards = getTaskCards(testDb.db, testDb.boardId)
    const card = cards.find((c) => c.id === task.id)

    expect(card?.isReady).toBe(true)
  })

  test("isReady is true for todo status with no blockers", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Todo task",
      status: "todo",
    })

    const cards = getTaskCards(testDb.db, testDb.boardId)
    const card = cards.find((c) => c.id === task.id)

    expect(card?.isReady).toBe(true)
  })

  test("isReady is false for in_progress tasks even with no blockers", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "In progress task",
      status: "backlog",
    })

    updateTaskStatus(testDb.db, task.id, "in_progress")

    const cards = getTaskCards(testDb.db, testDb.boardId)
    const card = cards.find((c) => c.id === task.id)

    expect(card?.isReady).toBe(false)
  })

  test("isReady is false when blocked even if status is backlog", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
      status: "backlog",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
      status: "todo",
    })

    addDependency(testDb.db, taskA.id, taskB.id)

    const cards = getTaskCards(testDb.db, testDb.boardId)
    const cardA = cards.find((c) => c.id === taskA.id)

    expect(cardA?.isReady).toBe(false)
  })

  test("subtask counts (total/done) are correct", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Parent",
      status: "in_progress",
    })

    createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child 1",
      status: "backlog",
    })

    const child2 = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child 2",
      status: "backlog",
    })

    createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child 3",
      status: "backlog",
    })

    // Complete child2
    updateTaskStatus(testDb.db, child2.id, "done")

    const cards = getTaskCards(testDb.db, testDb.boardId)
    const parentCard = cards.find((c) => c.id === parent.id)

    expect(parentCard?.subtaskTotal).toBe(3)
    expect(parentCard?.subtaskDone).toBe(1)
  })

  test("parentTitle is populated for subtasks", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "The Parent Task",
    })

    const child = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "A Subtask",
    })

    const cards = getTaskCards(testDb.db, testDb.boardId)
    const childCard = cards.find((c) => c.id === child.id)

    expect(childCard?.parentTitle).toBe("The Parent Task")
  })

  test("parentTitle is undefined for top-level tasks", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Top level",
    })

    const cards = getTaskCards(testDb.db, testDb.boardId)
    const card = cards.find((c) => c.id === task.id)

    expect(card?.parentTitle).toBeUndefined()
  })

  test("excludes archived tasks by default", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Will be archived",
    })

    archiveTask(testDb.db, task.id)

    const cards = getTaskCards(testDb.db, testDb.boardId)
    const card = cards.find((c) => c.id === task.id)

    expect(card).toBeUndefined()
  })

  test("includes archived tasks when includeArchived is true", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Archived task",
    })

    archiveTask(testDb.db, task.id)

    const cards = getTaskCards(testDb.db, testDb.boardId, { includeArchived: true })
    const card = cards.find((c) => c.id === task.id)

    expect(card).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════════
// archiveTask
// ═══════════════════════════════════════════════════════════════════

describe("archiveTask", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("soft-deletes task (sets archivedAt)", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Archive me",
    })

    const result = archiveTask(testDb.db, task.id)
    expect(result.hardDeleted).toBe(false)

    const archived = testDb.db.select().from(tasks).where(eq(tasks.id, task.id)).get()
    expect(archived?.archivedAt).toBeDefined()
    expect(archived?.archivedAt).toBeInstanceOf(Date)
  })

  test("cascades soft-delete to subtasks", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Parent",
    })

    const child1 = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child 1",
    })

    const child2 = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child 2",
    })

    archiveTask(testDb.db, parent.id)

    const archivedChild1 = testDb.db.select().from(tasks).where(eq(tasks.id, child1.id)).get()
    const archivedChild2 = testDb.db.select().from(tasks).where(eq(tasks.id, child2.id)).get()

    expect(archivedChild1?.archivedAt).toBeDefined()
    expect(archivedChild2?.archivedAt).toBeDefined()
  })

  test("hard-deletes if already archived (second call)", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Double delete",
    })

    // First call — soft delete
    const firstResult = archiveTask(testDb.db, task.id)
    expect(firstResult.hardDeleted).toBe(false)

    // Second call — hard delete
    const secondResult = archiveTask(testDb.db, task.id)
    expect(secondResult.hardDeleted).toBe(true)

    // Task should be completely gone
    const gone = testDb.db.select().from(tasks).where(eq(tasks.id, task.id)).get()
    expect(gone).toBeUndefined()
  })

  test("hard-delete cleans up dependencies", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
    })

    addDependency(testDb.db, taskA.id, taskB.id)

    // Soft-delete then hard-delete A
    archiveTask(testDb.db, taskA.id)
    archiveTask(testDb.db, taskA.id)

    // Dependency row should be cleaned up
    const deps = testDb.db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.taskId, taskA.id))
      .all()

    expect(deps).toHaveLength(0)
  })

  test("hard-delete cleans up status history", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task",
    })

    // Create some status history
    updateTaskStatus(testDb.db, task.id, "todo")

    // Soft-delete then hard-delete
    archiveTask(testDb.db, task.id)
    archiveTask(testDb.db, task.id)

    // Status history should be cleaned up
    const history = testDb.db
      .select()
      .from(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, task.id))
      .all()

    expect(history).toHaveLength(0)
  })

  test("hard-delete cascades to subtasks and cleans up their data", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Parent",
    })

    const child = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child",
    })

    // Soft-delete (cascades to child) then hard-delete
    archiveTask(testDb.db, parent.id)
    archiveTask(testDb.db, parent.id)

    // Both parent and child should be gone
    const parentRow = testDb.db.select().from(tasks).where(eq(tasks.id, parent.id)).get()
    const childRow = testDb.db.select().from(tasks).where(eq(tasks.id, child.id)).get()

    expect(parentRow).toBeUndefined()
    expect(childRow).toBeUndefined()

    // Child status history should also be cleaned up
    const childHistory = testDb.db
      .select()
      .from(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, child.id))
      .all()

    expect(childHistory).toHaveLength(0)
  })

  test("throws if task not found", () => {
    expect(() => {
      archiveTask(testDb.db, "nonexistent-id")
    }).toThrow("not found")
  })
})

// ═══════════════════════════════════════════════════════════════════
// unarchiveTask
// ═══════════════════════════════════════════════════════════════════

describe("unarchiveTask", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("restores an archived task (clears archivedAt)", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "To restore", priority: "normal" })
    archiveTask(testDb.db, task.id)

    // Verify it's archived
    const archived = testDb.db.select().from(tasks).where(eq(tasks.id, task.id)).get()
    expect(archived?.archivedAt).toBeDefined()

    unarchiveTask(testDb.db, task.id)

    const restored = testDb.db.select().from(tasks).where(eq(tasks.id, task.id)).get()
    expect(restored?.archivedAt).toBeNull()
  })

  test("cascades unarchive to subtasks", () => {
    const parent = createTask(testDb.db, { boardId: testDb.boardId, title: "Parent", priority: "normal" })
    const child1 = createTask(testDb.db, { boardId: testDb.boardId, title: "Child 1", priority: "normal", parentId: parent.id })
    const child2 = createTask(testDb.db, { boardId: testDb.boardId, title: "Child 2", priority: "normal", parentId: parent.id })

    archiveTask(testDb.db, parent.id)
    unarchiveTask(testDb.db, parent.id)

    const restoredParent = testDb.db.select().from(tasks).where(eq(tasks.id, parent.id)).get()
    const restoredChild1 = testDb.db.select().from(tasks).where(eq(tasks.id, child1.id)).get()
    const restoredChild2 = testDb.db.select().from(tasks).where(eq(tasks.id, child2.id)).get()

    expect(restoredParent?.archivedAt).toBeNull()
    expect(restoredChild1?.archivedAt).toBeNull()
    expect(restoredChild2?.archivedAt).toBeNull()
  })

  test("throws if task is not archived", () => {
    const task = createTask(testDb.db, { boardId: testDb.boardId, title: "Not archived", priority: "normal" })
    expect(() => {
      unarchiveTask(testDb.db, task.id)
    }).toThrow("not archived")
  })

  test("throws if task not found", () => {
    expect(() => {
      unarchiveTask(testDb.db, "nonexistent-id")
    }).toThrow("not found")
  })
})

// ═══════════════════════════════════════════════════════════════════
// addDependency / removeDependency
// ═══════════════════════════════════════════════════════════════════

describe("addDependency", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("adds dependency successfully", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
    })

    addDependency(testDb.db, taskA.id, taskB.id)

    const deps = testDb.db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.taskId, taskA.id))
      .all()

    expect(deps).toHaveLength(1)
    expect(deps[0].dependsOn).toBe(taskB.id)
  })

  test("throws on self-dependency (cycle)", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Self",
    })

    expect(() => {
      addDependency(testDb.db, task.id, task.id)
    }).toThrow("cycle")
  })

  test("throws on direct cycle (A→B then B→A)", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
    })

    addDependency(testDb.db, taskA.id, taskB.id)

    expect(() => {
      addDependency(testDb.db, taskB.id, taskA.id)
    }).toThrow("cycle")
  })

  test("throws on indirect cycle", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
    })

    const taskC = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task C",
    })

    addDependency(testDb.db, taskA.id, taskB.id)
    addDependency(testDb.db, taskB.id, taskC.id)

    expect(() => {
      addDependency(testDb.db, taskC.id, taskA.id)
    }).toThrow("cycle")
  })

  test("throws if task not found", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task",
    })

    expect(() => {
      addDependency(testDb.db, "nonexistent-id", task.id)
    }).toThrow("not found")
  })

  test("throws if dependency target not found", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task",
    })

    expect(() => {
      addDependency(testDb.db, task.id, "nonexistent-id")
    }).toThrow("not found")
  })

  test("throws if task is archived", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
    })

    archiveTask(testDb.db, taskA.id)

    expect(() => {
      addDependency(testDb.db, taskA.id, taskB.id)
    }).toThrow("archived")
  })

  test("throws if dependency target is archived", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
    })

    archiveTask(testDb.db, taskB.id)

    expect(() => {
      addDependency(testDb.db, taskA.id, taskB.id)
    }).toThrow("archived")
  })
})

describe("removeDependency", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("removes an existing dependency", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
    })

    addDependency(testDb.db, taskA.id, taskB.id)

    // Verify it exists
    let deps = testDb.db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.taskId, taskA.id))
      .all()
    expect(deps).toHaveLength(1)

    // Remove it
    removeDependency(testDb.db, taskA.id, taskB.id)

    // Verify it's gone
    deps = testDb.db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.taskId, taskA.id))
      .all()
    expect(deps).toHaveLength(0)
  })

  test("removing non-existent dependency is a no-op (no error)", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
    })

    // No dependency exists — this should not throw
    expect(() => {
      removeDependency(testDb.db, taskA.id, taskB.id)
    }).not.toThrow()
  })

  test("removes only the specified dependency, not others", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
    })

    const taskC = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task C",
    })

    addDependency(testDb.db, taskA.id, taskB.id)
    addDependency(testDb.db, taskA.id, taskC.id)

    removeDependency(testDb.db, taskA.id, taskB.id)

    const deps = testDb.db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.taskId, taskA.id))
      .all()

    expect(deps).toHaveLength(1)
    expect(deps[0].dependsOn).toBe(taskC.id)
  })
})

// ═══════════════════════════════════════════════════════════════════
// getTaskDetail
// ═══════════════════════════════════════════════════════════════════

describe("getTaskDetail", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("returns basic task fields", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Detailed task",
      description: "A description",
      priority: "high",
    })

    const detail = getTaskDetail(testDb.db, task.id)

    expect(detail.id).toBe(task.id)
    expect(detail.title).toBe("Detailed task")
    expect(detail.description).toBe("A description")
    expect(detail.priority).toBe("high")
  })

  test("populates subtasks", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Parent",
    })

    const child1 = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child 1",
    })

    const child2 = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child 2",
    })

    const detail = getTaskDetail(testDb.db, parent.id)

    expect(detail.subtasks).toHaveLength(2)
    const subtaskIds = detail.subtasks.map((s) => s.id)
    expect(subtaskIds).toContain(child1.id)
    expect(subtaskIds).toContain(child2.id)
  })

  test("populates dependsOn", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
    })

    addDependency(testDb.db, taskA.id, taskB.id)

    const detail = getTaskDetail(testDb.db, taskA.id)

    expect(detail.dependsOn).toHaveLength(1)
    expect(detail.dependsOn[0].id).toBe(taskB.id)
    expect(detail.dependsOn[0].title).toBe("Task B")
  })

  test("populates dependedOnBy", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
    })

    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
    })

    // B depends on A → A's dependedOnBy includes B
    addDependency(testDb.db, taskB.id, taskA.id)

    const detail = getTaskDetail(testDb.db, taskA.id)

    expect(detail.dependedOnBy).toHaveLength(1)
    expect(detail.dependedOnBy[0].id).toBe(taskB.id)
  })

  test("populates statusHistory", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task",
      status: "backlog",
    })

    updateTaskStatus(testDb.db, task.id, "todo")
    updateTaskStatus(testDb.db, task.id, "in_progress")

    const detail = getTaskDetail(testDb.db, task.id)

    // 3 entries: null→backlog, backlog→todo, todo→in_progress
    expect(detail.statusHistory).toHaveLength(3)

    // Verify all transitions are present (order may vary if timestamps match)
    const transitions = detail.statusHistory.map((h) => `${h.fromStatus}→${h.toStatus}`)
    expect(transitions).toContain("null→backlog")
    expect(transitions).toContain("backlog→todo")
    expect(transitions).toContain("todo→in_progress")
  })

  test("returns empty arrays when no subtasks/deps/history beyond initial", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Lonely task",
    })

    const detail = getTaskDetail(testDb.db, task.id)

    expect(detail.subtasks).toHaveLength(0)
    expect(detail.dependsOn).toHaveLength(0)
    expect(detail.dependedOnBy).toHaveLength(0)
    // Always has at least the initial status history entry
    expect(detail.statusHistory).toHaveLength(1)
  })

  test("throws if task not found", () => {
    expect(() => {
      getTaskDetail(testDb.db, "nonexistent-id")
    }).toThrow("not found")
  })
})

// ═══════════════════════════════════════════════════════════════════
// archiveDoneTasks
// ═══════════════════════════════════════════════════════════════════

describe("archiveDoneTasks", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("archives all done tasks on a board", () => {
    const task1 = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Done 1",
      status: "backlog",
    })
    updateTaskStatus(testDb.db, task1.id, "done")

    const task2 = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Done 2",
      status: "backlog",
    })
    updateTaskStatus(testDb.db, task2.id, "done")

    const count = archiveDoneTasks(testDb.db, testDb.boardId)
    expect(count).toBe(2)

    const archivedTask1 = testDb.db.select().from(tasks).where(eq(tasks.id, task1.id)).get()
    const archivedTask2 = testDb.db.select().from(tasks).where(eq(tasks.id, task2.id)).get()

    expect(archivedTask1?.archivedAt).toBeDefined()
    expect(archivedTask2?.archivedAt).toBeDefined()
  })

  test("returns correct count", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Done",
      status: "backlog",
    })
    updateTaskStatus(testDb.db, task.id, "done")

    const count = archiveDoneTasks(testDb.db, testDb.boardId)
    expect(count).toBe(1)
  })

  test("returns 0 when no done tasks exist", () => {
    createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Not done",
      status: "backlog",
    })

    const count = archiveDoneTasks(testDb.db, testDb.boardId)
    expect(count).toBe(0)
  })

  test("doesn't touch non-done tasks", () => {
    const backlogTask = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Backlog",
      status: "backlog",
    })

    const todoTask = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Todo",
      status: "todo",
    })

    const inProgressTask = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "In Progress",
      status: "backlog",
    })
    updateTaskStatus(testDb.db, inProgressTask.id, "in_progress")

    const doneTask = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Done",
      status: "backlog",
    })
    updateTaskStatus(testDb.db, doneTask.id, "done")

    archiveDoneTasks(testDb.db, testDb.boardId)

    // Non-done tasks should still be active
    const backlog = testDb.db.select().from(tasks).where(eq(tasks.id, backlogTask.id)).get()
    const todo = testDb.db.select().from(tasks).where(eq(tasks.id, todoTask.id)).get()
    const inProgress = testDb.db.select().from(tasks).where(eq(tasks.id, inProgressTask.id)).get()

    expect(backlog?.archivedAt).toBeNull()
    expect(todo?.archivedAt).toBeNull()
    expect(inProgress?.archivedAt).toBeNull()

    // Done task should be archived
    const done = testDb.db.select().from(tasks).where(eq(tasks.id, doneTask.id)).get()
    expect(done?.archivedAt).toBeDefined()
  })

  test("doesn't archive already-archived done tasks (no double-archive)", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Done",
      status: "backlog",
    })
    updateTaskStatus(testDb.db, task.id, "done")

    // Archive once
    archiveDoneTasks(testDb.db, testDb.boardId)

    // Second call should find nothing to archive
    const count = archiveDoneTasks(testDb.db, testDb.boardId)
    expect(count).toBe(0)
  })

  test("cascades archive to subtasks of done parent tasks", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Done Parent",
      status: "in_progress",
    })

    const child = createTask(testDb.db, {
      boardId: testDb.boardId,
      parentId: parent.id,
      title: "Child of done parent",
      status: "todo", // different lane from parent — won't cascade on status change
    })

    // Move parent to done — child stays "todo" (different lane)
    updateTaskStatus(testDb.db, parent.id, "done")

    // Verify child is still "todo" and not auto-moved
    const childBeforeArchive = testDb.db.select().from(tasks).where(eq(tasks.id, child.id)).get()
    expect(childBeforeArchive?.status).toBe("todo")

    archiveDoneTasks(testDb.db, testDb.boardId)

    // Parent should be archived
    const archivedParent = testDb.db.select().from(tasks).where(eq(tasks.id, parent.id)).get()
    expect(archivedParent?.archivedAt).toBeDefined()

    // Child should be cascade-archived via archiveTask
    const archivedChild = testDb.db.select().from(tasks).where(eq(tasks.id, child.id)).get()
    expect(archivedChild?.archivedAt).toBeDefined()
  })
})
