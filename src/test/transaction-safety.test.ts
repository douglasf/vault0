import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { createTestDb, closeTestDb, type TestDb } from "./helpers.js"
import { tasks, taskStatusHistory, taskDependencies } from "../db/schema.js"
import { eq } from "drizzle-orm"
import {
  createTask,
  updateTask,
  updateTaskStatus,
  archiveTask,
  addDependency,
} from "../db/queries.js"

// ═══════════════════════════════════════════════════════════════════
// Concurrent updateTaskStatus — no lost updates
// ═══════════════════════════════════════════════════════════════════

describe("concurrent updateTaskStatus calls", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("rapid sequential status transitions all recorded in history", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Rapid transitions",
      status: "backlog",
    })

    // Rapidly move through all statuses
    updateTaskStatus(testDb.db, task.id, "todo")
    updateTaskStatus(testDb.db, task.id, "in_progress")
    updateTaskStatus(testDb.db, task.id, "in_review")
    updateTaskStatus(testDb.db, task.id, "done")

    const final = testDb.db.select().from(tasks).where(eq(tasks.id, task.id)).get()
    expect(final?.status).toBe("done")

    const history = testDb.db
      .select()
      .from(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, task.id))
      .all()

    // 5 entries: null→backlog, backlog→todo, todo→in_progress, in_progress→in_review, in_review→done
    expect(history).toHaveLength(5)

    const transitions = history.map((h) => `${h.fromStatus}→${h.toStatus}`)
    expect(transitions).toContain("null→backlog")
    expect(transitions).toContain("backlog→todo")
    expect(transitions).toContain("todo→in_progress")
    expect(transitions).toContain("in_progress→in_review")
    expect(transitions).toContain("in_review→done")
  })

  test("multiple tasks updated in sequence all reflect correct final state", () => {
    const taskIds: string[] = []
    for (let i = 0; i < 10; i++) {
      const t = createTask(testDb.db, {
        boardId: testDb.boardId,
        title: `Task ${i}`,
        status: "backlog",
      })
      taskIds.push(t.id)
    }

    // Move all to todo, then all to in_progress
    for (const id of taskIds) {
      updateTaskStatus(testDb.db, id, "todo")
    }
    for (const id of taskIds) {
      updateTaskStatus(testDb.db, id, "in_progress")
    }

    // Verify all are in_progress with correct history count
    for (const id of taskIds) {
      const t = testDb.db.select().from(tasks).where(eq(tasks.id, id)).get()
      expect(t?.status).toBe("in_progress")

      const history = testDb.db
        .select()
        .from(taskStatusHistory)
        .where(eq(taskStatusHistory.taskId, id))
        .all()
      // null→backlog, backlog→todo, todo→in_progress
      expect(history).toHaveLength(3)
    }
  })

  test("parent cascade + subtask update don't lose either update", () => {
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

    // Move parent to todo (cascades to children)
    updateTaskStatus(testDb.db, parent.id, "todo")

    // Then move child1 independently to in_progress
    updateTaskStatus(testDb.db, child1.id, "in_progress")

    // Now move parent to in_progress (should only cascade to child2 which is still in "todo")
    updateTaskStatus(testDb.db, parent.id, "in_progress")

    const finalChild1 = testDb.db.select().from(tasks).where(eq(tasks.id, child1.id)).get()
    const finalChild2 = testDb.db.select().from(tasks).where(eq(tasks.id, child2.id)).get()

    expect(finalChild1?.status).toBe("in_progress")
    expect(finalChild2?.status).toBe("in_progress")

    // child1 history: null→backlog, backlog→todo (cascade), todo→in_progress (direct)
    const child1History = testDb.db
      .select()
      .from(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, child1.id))
      .all()
    expect(child1History).toHaveLength(3)

    // child2 history: null→backlog, backlog→todo (cascade), todo→in_progress (cascade)
    const child2History = testDb.db
      .select()
      .from(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, child2.id))
      .all()
    expect(child2History).toHaveLength(3)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Atomicity — multi-step operations fail fully or succeed fully
// ═══════════════════════════════════════════════════════════════════

describe("transaction atomicity", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("updateTaskStatus on non-existent task leaves DB unchanged", () => {
    // Create a task to have baseline data
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Existing",
      status: "backlog",
    })

    const historyBefore = testDb.db
      .select()
      .from(taskStatusHistory)
      .all()
    const tasksBefore = testDb.db.select().from(tasks).all()

    expect(() => {
      updateTaskStatus(testDb.db, "nonexistent-id", "todo")
    }).toThrow("not found")

    // DB should be unchanged
    const historyAfter = testDb.db
      .select()
      .from(taskStatusHistory)
      .all()
    const tasksAfter = testDb.db.select().from(tasks).all()

    expect(historyAfter).toHaveLength(historyBefore.length)
    expect(tasksAfter).toHaveLength(tasksBefore.length)

    // Original task untouched
    const original = testDb.db.select().from(tasks).where(eq(tasks.id, task.id)).get()
    expect(original?.status).toBe("backlog")
  })

  test("updateTaskStatus on archived task rolls back — no partial state", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Will archive",
      status: "backlog",
    })

    archiveTask(testDb.db, task.id)

    const historyBefore = testDb.db
      .select()
      .from(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, task.id))
      .all()

    expect(() => {
      updateTaskStatus(testDb.db, task.id, "todo")
    }).toThrow("archived")

    // No new history entries added (transaction rolled back)
    const historyAfter = testDb.db
      .select()
      .from(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, task.id))
      .all()

    expect(historyAfter).toHaveLength(historyBefore.length)
  })

  test("updateTask on archived task rolls back — no partial writes", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Original title",
      status: "backlog",
    })

    archiveTask(testDb.db, task.id)

    expect(() => {
      updateTask(testDb.db, task.id, { title: "Should not stick" })
    }).toThrow("archived")

    // Title unchanged
    const current = testDb.db.select().from(tasks).where(eq(tasks.id, task.id)).get()
    expect(current?.title).toBe("Original title")
  })

  test("addDependency cycle detection rolls back — no partial dependency", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "A",
    })
    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "B",
    })

    addDependency(testDb.db, taskA.id, taskB.id)

    expect(() => {
      addDependency(testDb.db, taskB.id, taskA.id)
    }).toThrow("cycle")

    // Only one dependency should exist (A→B), not the reverse
    const deps = testDb.db
      .select()
      .from(taskDependencies)
      .all()

    // Filter to just these two tasks
    const relevantDeps = deps.filter(
      (d) =>
        (d.taskId === taskA.id || d.taskId === taskB.id) &&
        (d.dependsOn === taskA.id || d.dependsOn === taskB.id),
    )
    expect(relevantDeps).toHaveLength(1)
    expect(relevantDeps[0].taskId).toBe(taskA.id)
    expect(relevantDeps[0].dependsOn).toBe(taskB.id)
  })

  test("createTask with invalid parent rolls back — no orphaned status history", () => {
    const historyBefore = testDb.db
      .select()
      .from(taskStatusHistory)
      .all()
    const tasksBefore = testDb.db.select().from(tasks).all()

    expect(() => {
      createTask(testDb.db, {
        boardId: testDb.boardId,
        parentId: "nonexistent-parent",
        title: "Should not exist",
      })
    }).toThrow("not found")

    // No new tasks or history entries
    const historyAfter = testDb.db
      .select()
      .from(taskStatusHistory)
      .all()
    const tasksAfter = testDb.db.select().from(tasks).all()

    expect(tasksAfter).toHaveLength(tasksBefore.length)
    expect(historyAfter).toHaveLength(historyBefore.length)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Database error handling and recovery
// ═══════════════════════════════════════════════════════════════════

describe("database error handling", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    try {
      closeTestDb(testDb.sqlite)
    } catch {
      // May already be closed by the test
    }
  })

  test("operations on closed database throw meaningful errors", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Before close",
    })

    // Close the underlying SQLite connection
    testDb.sqlite.close()

    expect(() => {
      createTask(testDb.db, {
        boardId: testDb.boardId,
        title: "After close",
      })
    }).toThrow()

    expect(() => {
      updateTaskStatus(testDb.db, task.id, "todo")
    }).toThrow()

    expect(() => {
      updateTask(testDb.db, task.id, { title: "Nope" })
    }).toThrow()
  })

  test("read-only database rejects write operations", () => {
    // Create a temp file-based DB, then reopen as read-only
    const { Database } = require("bun:sqlite")
    const { drizzle } = require("drizzle-orm/bun-sqlite")
    const schema = require("../db/schema.js")
    const { runEmbeddedMigrations } = require("../db/migrations.js")
    const { seedDefaultBoard } = require("../db/seed.js")
    const { boards } = require("../db/schema.js")
    const fs = require("node:fs")
    const os = require("node:os")
    const path = require("node:path")

    const tmpFile = path.join(os.tmpdir(), `vault0-ro-test-${Date.now()}.db`)

    try {
      // Create and populate the DB
      const writeSqlite = new Database(tmpFile)
      writeSqlite.exec("PRAGMA foreign_keys = ON")
      runEmbeddedMigrations(writeSqlite)
      const writeDb = drizzle({ client: writeSqlite, schema })
      seedDefaultBoard(writeDb)
      writeSqlite.close()

      // Reopen read-only
      const roSqlite = new Database(tmpFile, { readonly: true })
      const roDb = drizzle({ client: roSqlite, schema })
      const board = roDb.select().from(boards).limit(1).get()

      // Read should work
      expect(board).toBeDefined()

      // Write should fail
      expect(() => {
        createTask(roDb, {
          boardId: board.id,
          title: "Should fail",
        })
      }).toThrow()

      roSqlite.close()
    } finally {
      try {
        fs.unlinkSync(tmpFile)
      } catch {
        // cleanup best-effort
      }
    }
  })

  test("database recovers after failed transaction — subsequent ops succeed", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Resilient task",
      status: "backlog",
    })

    // Cause a failed transaction
    expect(() => {
      updateTaskStatus(testDb.db, "nonexistent", "todo")
    }).toThrow("not found")

    // DB should still be fully functional
    updateTaskStatus(testDb.db, task.id, "todo")
    const updated = testDb.db.select().from(tasks).where(eq(tasks.id, task.id)).get()
    expect(updated?.status).toBe("todo")

    // Another operation
    const task2 = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "New task after error",
    })
    expect(task2.id).toBeDefined()
  })

  test("multiple consecutive failed transactions don't corrupt state", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Stable task",
      status: "backlog",
    })

    // Trigger multiple failures
    for (let i = 0; i < 5; i++) {
      expect(() => {
        updateTaskStatus(testDb.db, "ghost-id", "todo")
      }).toThrow("not found")
    }

    // DB still works correctly
    updateTaskStatus(testDb.db, task.id, "todo")
    updateTaskStatus(testDb.db, task.id, "in_progress")

    const final = testDb.db.select().from(tasks).where(eq(tasks.id, task.id)).get()
    expect(final?.status).toBe("in_progress")

    const history = testDb.db
      .select()
      .from(taskStatusHistory)
      .where(eq(taskStatusHistory.taskId, task.id))
      .all()
    expect(history).toHaveLength(3) // null→backlog, backlog→todo, todo→in_progress
  })

  test("archiveTask error doesn't leave task in inconsistent state", () => {
    // Try archiving non-existent task
    expect(() => {
      archiveTask(testDb.db, "nonexistent-id")
    }).toThrow("not found")

    // Create a task and archive it successfully
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Archive test",
    })

    const result = archiveTask(testDb.db, task.id)
    expect(result.hardDeleted).toBe(false)

    const archived = testDb.db.select().from(tasks).where(eq(tasks.id, task.id)).get()
    expect(archived?.archivedAt).toBeInstanceOf(Date)
  })
})
