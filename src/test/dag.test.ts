import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { createTestDb, closeTestDb, type TestDb } from "./helpers.js"
import { tasks, taskDependencies } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { wouldCreateCycle } from "../lib/dag.js"

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Insert a task into the test DB and return its ID.
 */
function insertTask(testDb: TestDb, title: string): string {
  testDb.db.insert(tasks).values({
    boardId: testDb.boardId,
    title,
    status: "backlog",
  }).run()

  const task = testDb.db
    .select()
    .from(tasks)
    .where(eq(tasks.title, title))
    .get()

  if (!task) throw new Error(`Failed to insert task: ${title}`)
  return task.id
}

/**
 * Insert a dependency edge: taskId depends on dependsOn.
 */
function insertDep(testDb: TestDb, taskId: string, dependsOn: string): void {
  testDb.db.insert(taskDependencies).values({ taskId, dependsOn }).run()
}

// ═══════════════════════════════════════════════════════════════════
// wouldCreateCycle — DB-based tests
// ═══════════════════════════════════════════════════════════════════

describe("wouldCreateCycle", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("self-dependency (A→A) returns true", () => {
    const A = insertTask(testDb, "A")
    expect(wouldCreateCycle(testDb.db, A, A)).toBe(true)
  })

  test("direct cycle (A→B then B→A) returns true", () => {
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")

    // A already depends on B
    insertDep(testDb, A, B)

    // Would adding B→A create a cycle? Yes.
    expect(wouldCreateCycle(testDb.db, B, A)).toBe(true)
  })

  test("indirect cycle (A→B→C then C→A) returns true", () => {
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")
    const C = insertTask(testDb, "C")

    // A depends on B, B depends on C
    insertDep(testDb, A, B)
    insertDep(testDb, B, C)

    // Would adding C→A create a cycle? Yes (C→A→B→C).
    expect(wouldCreateCycle(testDb.db, C, A)).toBe(true)
  })

  test("no cycle — convergent deps (A→B, C→B) then adding A→C is safe", () => {
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")
    const C = insertTask(testDb, "C")

    // A depends on B, C depends on B
    insertDep(testDb, A, B)
    insertDep(testDb, C, B)

    // Would adding A→C create a cycle? No.
    expect(wouldCreateCycle(testDb.db, A, C)).toBe(false)
  })

  test("disjoint graph — no path between nodes returns false", () => {
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")
    const C = insertTask(testDb, "C")
    const D = insertTask(testDb, "D")

    // A→B and C→D are separate components
    insertDep(testDb, A, B)
    insertDep(testDb, C, D)

    // Would adding A→C create a cycle? No — they're separate.
    expect(wouldCreateCycle(testDb.db, A, C)).toBe(false)
    // Would adding C→A create a cycle? No.
    expect(wouldCreateCycle(testDb.db, C, A)).toBe(false)
  })

  test("adding first dependency is never a cycle", () => {
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")

    // No existing edges at all
    expect(wouldCreateCycle(testDb.db, A, B)).toBe(false)
  })

  test("longer indirect cycle (A→B→C→D then D→A) returns true", () => {
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")
    const C = insertTask(testDb, "C")
    const D = insertTask(testDb, "D")

    insertDep(testDb, A, B)
    insertDep(testDb, B, C)
    insertDep(testDb, C, D)

    // Would adding D→A create a cycle? Yes (D→A→B→C→D).
    expect(wouldCreateCycle(testDb.db, D, A)).toBe(true)
  })
})
