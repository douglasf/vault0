import { describe, test, expect, afterEach } from "bun:test"
import { createTestDb, closeTestDb, type TestDb } from "./helpers.js"
import { tasks, boards, taskStatusHistory } from "../db/schema.js"
import { eq } from "drizzle-orm"

describe("test infrastructure", () => {
  let testDb: TestDb

  afterEach(() => {
    if (testDb?.sqlite) {
      closeTestDb(testDb.sqlite)
    }
  })

  test("createTestDb returns a working database with a seeded board", () => {
    testDb = createTestDb()

    expect(testDb.db).toBeDefined()
    expect(testDb.sqlite).toBeDefined()
    expect(testDb.boardId).toBeDefined()
    expect(typeof testDb.boardId).toBe("string")
    expect(testDb.boardId.length).toBeGreaterThan(0)

    // Verify the board exists in the database
    const board = testDb.db.select().from(boards).where(eq(boards.id, testDb.boardId)).get()
    expect(board).toBeDefined()
    expect(board?.name).toBe("Default")
  })

  test("can insert a task and query it back", () => {
    testDb = createTestDb()

    // Insert a task
    testDb.db.insert(tasks).values({
      boardId: testDb.boardId,
      title: "Test task",
      description: "A test task for smoke testing",
      status: "todo",
      priority: "high",
    }).run()

    // Query it back
    const allTasks = testDb.db
      .select()
      .from(tasks)
      .where(eq(tasks.boardId, testDb.boardId))
      .all()

    expect(allTasks).toHaveLength(1)
    expect(allTasks[0].title).toBe("Test task")
    expect(allTasks[0].description).toBe("A test task for smoke testing")
    expect(allTasks[0].status).toBe("todo")
    expect(allTasks[0].priority).toBe("high")
    expect(allTasks[0].boardId).toBe(testDb.boardId)
    expect(allTasks[0].id).toBeDefined()
  })

  test("can insert status history and query it back", () => {
    testDb = createTestDb()

    // Insert a task first
    testDb.db.insert(tasks).values({
      boardId: testDb.boardId,
      title: "Task with history",
      status: "backlog",
    }).run()

    const task = testDb.db
      .select()
      .from(tasks)
      .where(eq(tasks.boardId, testDb.boardId))
      .get()

    expect(task).toBeDefined()

    // Insert status history
    testDb.db.insert(taskStatusHistory).values({
      taskId: task?.id ?? "",
      fromStatus: null,
      toStatus: "backlog",
    }).run()

    testDb.db.insert(taskStatusHistory).values({
      taskId: task?.id ?? "",
      fromStatus: "backlog",
      toStatus: "todo",
    }).run()

    // Query history
    const taskId = task?.id ?? ""
    const history = testDb.db
      .select()
      .from(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, taskId))
      .all()

    expect(history).toHaveLength(2)
    expect(history[0].fromStatus).toBeNull()
    expect(history[0].toStatus).toBe("backlog")
    expect(history[1].fromStatus).toBe("backlog")
    expect(history[1].toStatus).toBe("todo")
  })

  test("each createTestDb call returns an isolated database", () => {
    testDb = createTestDb()
    const testDb2 = createTestDb()

    // Insert a task in the first DB
    testDb.db.insert(tasks).values({
      boardId: testDb.boardId,
      title: "Only in DB 1",
    }).run()

    // The second DB should have no tasks
    const tasksInDb2 = testDb2.db
      .select()
      .from(tasks)
      .where(eq(tasks.boardId, testDb2.boardId))
      .all()

    expect(tasksInDb2).toHaveLength(0)

    // Clean up the second DB
    closeTestDb(testDb2.sqlite)
  })
})
