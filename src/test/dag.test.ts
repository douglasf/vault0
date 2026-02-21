import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { createTestDb, closeTestDb, type TestDb } from "./helpers.js"
import { tasks, taskDependencies } from "../db/schema.js"
import { eq } from "drizzle-orm"
import {
  topologicalSort,
  wouldCreateCycle,
  getTransitiveDependencies,
  getTransitiveDependents,
} from "../lib/dag.js"
import type { Task } from "../lib/types.js"

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Create a minimal mock Task object. topologicalSort only uses the `id` field,
 * but the type requires all columns, so we fill in sensible defaults.
 */
function mockTask(id: string): Task {
  const now = new Date()
  return {
    id,
    boardId: "mock-board",
    parentId: null,
    title: `Task ${id}`,
    description: null,
    status: "backlog",
    priority: "normal",
    type: null,
    source: "manual",
    sourceRef: null,
    tags: [],
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  }
}

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
// topologicalSort — pure function tests (no DB needed)
// ═══════════════════════════════════════════════════════════════════

describe("topologicalSort", () => {
  test("empty input returns empty output", () => {
    const result = topologicalSort([], [])
    expect(result).toEqual([])
  })

  test("single node with no dependencies returns it", () => {
    const A = mockTask("A")
    const result = topologicalSort([A], [])
    expect(result).toEqual([A])
  })

  test("two independent nodes returns both", () => {
    const A = mockTask("A")
    const B = mockTask("B")
    const result = topologicalSort([A, B], [])
    expect(result).toHaveLength(2)
    expect(result).toContainEqual(A)
    expect(result).toContainEqual(B)
  })

  test("linear chain A depends on B depends on C returns [C, B, A]", () => {
    const A = mockTask("A")
    const B = mockTask("B")
    const C = mockTask("C")

    // A depends on B, B depends on C
    const deps = [
      { taskId: "A", dependsOn: "B" },
      { taskId: "B", dependsOn: "C" },
    ]

    const result = topologicalSort([A, B, C], deps)
    expect(result).toHaveLength(3)

    // C must come before B, B must come before A
    const indexC = result.findIndex((t) => t.id === "C")
    const indexB = result.findIndex((t) => t.id === "B")
    const indexA = result.findIndex((t) => t.id === "A")
    expect(indexC).toBeLessThan(indexB)
    expect(indexB).toBeLessThan(indexA)
  })

  test("diamond dependency produces valid topological order", () => {
    // A depends on B and C; B depends on D; C depends on D
    const A = mockTask("A")
    const B = mockTask("B")
    const C = mockTask("C")
    const D = mockTask("D")

    const deps = [
      { taskId: "A", dependsOn: "B" },
      { taskId: "A", dependsOn: "C" },
      { taskId: "B", dependsOn: "D" },
      { taskId: "C", dependsOn: "D" },
    ]

    const result = topologicalSort([A, B, C, D], deps)
    expect(result).toHaveLength(4)

    const indexOf = (id: string) => result.findIndex((t) => t.id === id)

    // D must come before B and C; B and C must come before A
    expect(indexOf("D")).toBeLessThan(indexOf("B"))
    expect(indexOf("D")).toBeLessThan(indexOf("C"))
    expect(indexOf("B")).toBeLessThan(indexOf("A"))
    expect(indexOf("C")).toBeLessThan(indexOf("A"))
  })

  test("disconnected components — all nodes returned", () => {
    // Component 1: A→B   Component 2: C→D   Isolated: E
    const nodes = ["A", "B", "C", "D", "E"].map(mockTask)

    const deps = [
      { taskId: "A", dependsOn: "B" },
      { taskId: "C", dependsOn: "D" },
    ]

    const result = topologicalSort(nodes, deps)
    expect(result).toHaveLength(5)

    const indexOf = (id: string) => result.findIndex((t) => t.id === id)
    expect(indexOf("B")).toBeLessThan(indexOf("A"))
    expect(indexOf("D")).toBeLessThan(indexOf("C"))
  })

  test("deps referencing tasks not in the task list are ignored", () => {
    const A = mockTask("A")
    const B = mockTask("B")

    // Dependency references "Z" which is not in the task list
    const deps = [
      { taskId: "A", dependsOn: "B" },
      { taskId: "A", dependsOn: "Z" },
      { taskId: "Z", dependsOn: "B" },
    ]

    const result = topologicalSort([A, B], deps)
    expect(result).toHaveLength(2)

    const indexOf = (id: string) => result.findIndex((t) => t.id === id)
    expect(indexOf("B")).toBeLessThan(indexOf("A"))
  })

  test("longer chain preserves full ordering", () => {
    // A→B→C→D→E — longest path
    const nodes = ["A", "B", "C", "D", "E"].map(mockTask)

    const deps = [
      { taskId: "A", dependsOn: "B" },
      { taskId: "B", dependsOn: "C" },
      { taskId: "C", dependsOn: "D" },
      { taskId: "D", dependsOn: "E" },
    ]

    const result = topologicalSort(nodes, deps)
    expect(result).toHaveLength(5)

    // Must be E, D, C, B, A (exact order since it's a single chain)
    expect(result.map((t) => t.id)).toEqual(["E", "D", "C", "B", "A"])
  })
})

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

// ═══════════════════════════════════════════════════════════════════
// getTransitiveDependencies — DB-based tests
// ═══════════════════════════════════════════════════════════════════

describe("getTransitiveDependencies", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("no dependencies returns empty array", () => {
    const A = insertTask(testDb, "A")
    const result = getTransitiveDependencies(testDb.db, A)
    expect(result).toEqual([])
  })

  test("direct dependencies only", () => {
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")
    const C = insertTask(testDb, "C")

    // A depends on B and C
    insertDep(testDb, A, B)
    insertDep(testDb, A, C)

    const result = getTransitiveDependencies(testDb.db, A)
    expect(result).toHaveLength(2)
    expect(result).toContain(B)
    expect(result).toContain(C)
  })

  test("transitive chain A→B→C returns [B, C]", () => {
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")
    const C = insertTask(testDb, "C")

    insertDep(testDb, A, B)
    insertDep(testDb, B, C)

    const result = getTransitiveDependencies(testDb.db, A)
    expect(result).toHaveLength(2)
    expect(result).toContain(B)
    expect(result).toContain(C)
  })

  test("diamond produces no duplicates", () => {
    // A depends on B and C; B and C both depend on D
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")
    const C = insertTask(testDb, "C")
    const D = insertTask(testDb, "D")

    insertDep(testDb, A, B)
    insertDep(testDb, A, C)
    insertDep(testDb, B, D)
    insertDep(testDb, C, D)

    const result = getTransitiveDependencies(testDb.db, A)
    // Should contain B, C, D — no duplicates
    expect(result).toHaveLength(3)
    expect(result).toContain(B)
    expect(result).toContain(C)
    expect(result).toContain(D)

    // Verify no duplicates
    const unique = new Set(result)
    expect(unique.size).toBe(result.length)
  })

  test("deep chain returns all ancestors", () => {
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")
    const C = insertTask(testDb, "C")
    const D = insertTask(testDb, "D")
    const E = insertTask(testDb, "E")

    insertDep(testDb, A, B)
    insertDep(testDb, B, C)
    insertDep(testDb, C, D)
    insertDep(testDb, D, E)

    const result = getTransitiveDependencies(testDb.db, A)
    expect(result).toHaveLength(4)
    expect(result).toContain(B)
    expect(result).toContain(C)
    expect(result).toContain(D)
    expect(result).toContain(E)
  })

  test("querying a leaf node (no upstream) returns empty", () => {
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")

    // A depends on B; query B's deps
    insertDep(testDb, A, B)

    const result = getTransitiveDependencies(testDb.db, B)
    expect(result).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════
// getTransitiveDependents — DB-based tests
// ═══════════════════════════════════════════════════════════════════

describe("getTransitiveDependents", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("no dependents returns empty array", () => {
    const A = insertTask(testDb, "A")
    const result = getTransitiveDependents(testDb.db, A)
    expect(result).toEqual([])
  })

  test("direct dependents only", () => {
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")
    const C = insertTask(testDb, "C")

    // B and C both depend on A
    insertDep(testDb, B, A)
    insertDep(testDb, C, A)

    const result = getTransitiveDependents(testDb.db, A)
    expect(result).toHaveLength(2)
    expect(result).toContain(B)
    expect(result).toContain(C)
  })

  test("transitive chain C→B→A — dependents of C are [B, A]", () => {
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")
    const C = insertTask(testDb, "C")

    // A depends on B, B depends on C
    insertDep(testDb, A, B)
    insertDep(testDb, B, C)

    // Dependents of C: B (directly) and A (transitively)
    const result = getTransitiveDependents(testDb.db, C)
    expect(result).toHaveLength(2)
    expect(result).toContain(B)
    expect(result).toContain(A)
  })

  test("multiple paths converging — no duplicates", () => {
    // D depends on B and C; B depends on A; C depends on A
    // Dependents of A: B, C, D — with A→B→D and A→C→D both reaching D
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")
    const C = insertTask(testDb, "C")
    const D = insertTask(testDb, "D")

    insertDep(testDb, B, A)
    insertDep(testDb, C, A)
    insertDep(testDb, D, B)
    insertDep(testDb, D, C)

    const result = getTransitiveDependents(testDb.db, A)
    expect(result).toHaveLength(3)
    expect(result).toContain(B)
    expect(result).toContain(C)
    expect(result).toContain(D)

    // Verify no duplicates
    const unique = new Set(result)
    expect(unique.size).toBe(result.length)
  })

  test("querying a root node (nothing depends on it) returns empty", () => {
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")

    // A depends on B; query A's dependents (nothing depends on A)
    insertDep(testDb, A, B)

    const result = getTransitiveDependents(testDb.db, A)
    expect(result).toEqual([])
  })

  test("deep downstream chain returns all descendants", () => {
    const A = insertTask(testDb, "A")
    const B = insertTask(testDb, "B")
    const C = insertTask(testDb, "C")
    const D = insertTask(testDb, "D")
    const E = insertTask(testDb, "E")

    // E→D→C→B→A (each depends on the previous)
    insertDep(testDb, B, A)
    insertDep(testDb, C, B)
    insertDep(testDb, D, C)
    insertDep(testDb, E, D)

    const result = getTransitiveDependents(testDb.db, A)
    expect(result).toHaveLength(4)
    expect(result).toContain(B)
    expect(result).toContain(C)
    expect(result).toContain(D)
    expect(result).toContain(E)
  })
})
