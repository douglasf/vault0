/**
 * Comprehensive test script for Step 3: Query Helpers & DAG Operations.
 *
 * Usage: bun src/test-queries.ts
 *
 * Tests:
 * 1. createTask() — task creation with status history
 * 2. getTasksByStatus() — grouping and sorting
 * 3. updateTaskStatus() — status transitions with history
 * 4. getTaskCards() — enriched cards with ready/blocked state
 * 5. addDependency() with cycle detection
 * 6. archiveTask() — cascade archiving of subtasks
 * 7. getTaskDetail() — full relation population
 * 8. topologicalSort() — dependency ordering
 * 9. getTransitiveDependencies() / getTransitiveDependents()
 * 10. getReadyTasks() / getBlockedTasks() filters
 */
import { initDatabase } from "./db/connection.js"
import { seedDefaultBoard } from "./db/seed.js"
import { boards, tasks, taskDependencies, taskStatusHistory } from "./db/schema.js"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import {
  createTask,
  updateTaskStatus,
  getTasksByStatus,
  getTaskCards,
  getReadyTasks,
  getBlockedTasks,
  addDependency,
  removeDependency,
  archiveTask,
  getTaskDetail,
  getStatusHistory,
  updateTask,
} from "./db/queries.js"
import { topologicalSort, getTransitiveDependencies, getTransitiveDependents } from "./lib/dag.js"

// ── Setup ───────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`   ✓ ${label}`)
    passed++
  } else {
    console.error(`   ✗ ${label}`)
    failed++
  }
}

function assertThrows(fn: () => void, label: string) {
  try {
    fn()
    console.error(`   ✗ ${label} (expected error, but none thrown)`)
    failed++
  } catch {
    console.log(`   ✓ ${label}`)
    passed++
  }
}

const repoRoot = process.cwd()
console.log("=== Vault0 Query & DAG Tests ===\n")

// Initialize fresh DB
console.log("Setting up database...")
const { db, sqlite } = initDatabase(repoRoot)
migrate(db, { migrationsFolder: "./drizzle" })

// Clean slate: remove all existing data
db.delete(taskStatusHistory).run()
db.delete(taskDependencies).run()
db.delete(tasks).run()
db.delete(boards).run()
seedDefaultBoard(db)

const allBoards = db.select().from(boards).all()
const boardId = allBoards[0].id
console.log(`Board: ${allBoards[0].name} (${boardId})\n`)

// ── Test 1: createTask ──────────────────────────────────────────────

console.log("1. createTask()")
const taskA = createTask(db, { boardId, title: "Task A", priority: "high", status: "todo" })
const taskB = createTask(db, { boardId, title: "Task B", priority: "normal", status: "backlog" })
const taskC = createTask(db, { boardId, title: "Task C", priority: "critical", status: "in_progress" })
const taskD = createTask(db, { boardId, title: "Task D", priority: "low", status: "todo" })

assert(taskA.id.length > 0, "Task A created with valid ID")
assert(taskA.title === "Task A", "Task A title is correct")
assert(taskA.status === "todo", "Task A status is 'todo'")
assert(taskA.priority === "high", "Task A priority is 'high'")
assert(taskB.status === "backlog", "Task B defaults to backlog")

// Check initial status history was recorded
const histA = getStatusHistory(db, taskA.id)
assert(histA.length === 1, "Task A has 1 status history entry")
assert(histA[0].fromStatus === null, "Initial history has null fromStatus")
assert(histA[0].toStatus === "todo", "Initial history toStatus is 'todo'")

// ── Test 2: getTasksByStatus ────────────────────────────────────────

console.log("\n2. getTasksByStatus()")
const byStatus = getTasksByStatus(db, boardId)
assert(byStatus.get("todo")?.length === 2, "2 tasks in 'todo' column (A, D)")
assert(byStatus.get("backlog")?.length === 1, "1 task in 'backlog' column (B)")
assert(byStatus.get("in_progress")?.length === 1, "1 task in 'in_progress' column (C)")
assert(byStatus.get("in_review")?.length === 0, "0 tasks in 'in_review' column")
assert(byStatus.get("done")?.length === 0, "0 tasks in 'done' column")

// ── Test 3: updateTaskStatus ────────────────────────────────────────

console.log("\n3. updateTaskStatus()")
updateTaskStatus(db, taskA.id, "in_progress")
const histA2 = getStatusHistory(db, taskA.id)
assert(histA2.length === 2, "Task A now has 2 history entries")
assert(histA2[0].fromStatus === "todo", "Latest transition: from 'todo'")
assert(histA2[0].toStatus === "in_progress", "Latest transition: to 'in_progress'")

// Move it back for later tests
updateTaskStatus(db, taskA.id, "todo")

// ── Test 4: Dependencies & Cycle Detection ──────────────────────────

console.log("\n4. addDependency() & cycle detection")

// A depends on B (A needs B to be done first)
addDependency(db, taskA.id, taskB.id)
assert(true, "A -> B dependency added successfully")

// B depends on C
addDependency(db, taskB.id, taskC.id)
assert(true, "B -> C dependency added successfully")

// Trying C -> A should fail (creates cycle: C -> A -> B -> C)
assertThrows(
  () => addDependency(db, taskC.id, taskA.id),
  "C -> A rejected (would create cycle)",
)

// Self-dependency should also fail
assertThrows(
  () => addDependency(db, taskA.id, taskA.id),
  "A -> A rejected (self-dependency)",
)

// D depends on C (valid — no cycle)
addDependency(db, taskD.id, taskC.id)
assert(true, "D -> C dependency added successfully")

// ── Test 5: getTaskCards (ready/blocked) ────────────────────────────

console.log("\n5. getTaskCards() — ready/blocked state")
const cards = getTaskCards(db, boardId)

const cardA = cards.find((c) => c.id === taskA.id)
const cardB = cards.find((c) => c.id === taskB.id)
const cardC = cards.find((c) => c.id === taskC.id)
const cardD = cards.find((c) => c.id === taskD.id)

assert(cardA !== undefined, "Card A found")
assert(cardA?.dependencyCount === 1, "A has 1 dependency (B)")
assert(cardA?.isBlocked === true, "A is blocked (B not done)")
assert(cardA?.isReady === false, "A is NOT ready (B not done)")

assert(cardB?.dependencyCount === 1, "B has 1 dependency (C)")
assert(cardB?.isBlocked === true, "B is blocked (C not done)")

assert(cardC?.dependencyCount === 0, "C has 0 dependencies")
assert(cardC?.isBlocked === false, "C is NOT blocked")

assert(cardD?.dependencyCount === 1, "D has 1 dependency (C)")
assert(cardD?.isBlocked === true, "D is blocked (C not done)")

// ── Test 6: getReadyTasks / getBlockedTasks ─────────────────────────

console.log("\n6. getReadyTasks() / getBlockedTasks()")
const blocked = getBlockedTasks(db, boardId)
assert(blocked.length === 3, "3 blocked tasks (A, B, D)")

// Now mark C as done — B and D should become unblocked
updateTaskStatus(db, taskC.id, "done")

const blocked2 = getBlockedTasks(db, boardId)
const ready2 = getReadyTasks(db, boardId)

// B is in backlog, has dependency on C (now done) => ready
assert(ready2.some((r) => r.id === taskB.id), "B is now ready (C done, B in backlog)")
// D is in todo, has dependency on C (now done) => ready
assert(ready2.some((r) => r.id === taskD.id), "D is now ready (C done, D in todo)")
// A still blocked by B (which is backlog, not done)
assert(blocked2.some((b) => b.id === taskA.id), "A is still blocked (B not done)")

// ── Test 7: Subtasks & archiveTask ──────────────────────────────────

console.log("\n7. archiveTask() with subtask cascade")
const parentTask = createTask(db, { boardId, title: "Parent Task", status: "todo" })
const sub1 = createTask(db, { boardId, parentId: parentTask.id, title: "Subtask 1", status: "todo" })
const sub2 = createTask(db, { boardId, parentId: parentTask.id, title: "Subtask 2", status: "done" })

// Verify subtask counts in cards before archiving
const cardsWithParent = getTaskCards(db, boardId)
const parentCard = cardsWithParent.find((c) => c.id === parentTask.id)
assert(parentCard?.subtaskTotal === 2, "Parent has 2 subtasks")
assert(parentCard?.subtaskDone === 1, "Parent has 1 done subtask")

// Archive parent — should cascade to subtasks
archiveTask(db, parentTask.id)

const afterArchive = getTasksByStatus(db, boardId)
const allTodoTasks = afterArchive.get("todo") ?? []
assert(!allTodoTasks.some((t) => t.id === parentTask.id), "Parent no longer in active tasks")
assert(!allTodoTasks.some((t) => t.id === sub1.id), "Subtask 1 no longer in active tasks")

// ── Test 8: getTaskDetail ───────────────────────────────────────────

console.log("\n8. getTaskDetail()")
const detailA = getTaskDetail(db, taskA.id)
assert(detailA.title === "Task A", "Detail: correct title")
assert(detailA.dependsOn.length === 1, "Detail: 1 dependency (B)")
assert(detailA.dependsOn[0].id === taskB.id, "Detail: dependency is B")
assert(detailA.statusHistory.length >= 3, "Detail: has status history (initial + 2 transitions)")

const detailC = getTaskDetail(db, taskC.id)
assert(detailC.dependedOnBy.length === 2, "Detail C: depended on by 2 tasks (B, D)")

// ── Test 9: updateTask ──────────────────────────────────────────────

console.log("\n9. updateTask()")
const updated = updateTask(db, taskA.id, { title: "Task A (updated)", priority: "critical" })
assert(updated?.title === "Task A (updated)", "Title updated correctly")
assert(updated?.priority === "critical", "Priority updated correctly")

// ── Test 10: topologicalSort ────────────────────────────────────────

console.log("\n10. topologicalSort()")
// Get current non-archived tasks for topo sort
const allActiveTasks = db.select().from(tasks).all()
  .filter((t) => t.archivedAt === null)

const allDeps = db.select().from(taskDependencies).all()

const sorted = topologicalSort(allActiveTasks, allDeps)

// C must come before B (B depends on C)
const sortedIds = sorted.map((t) => t.id)
const cIdx = sortedIds.indexOf(taskC.id)
const bIdx = sortedIds.indexOf(taskB.id)
const aIdx = sortedIds.indexOf(taskA.id)
const dIdx = sortedIds.indexOf(taskD.id)

assert(cIdx < bIdx, "Topo sort: C before B (B depends on C)")
assert(bIdx < aIdx, "Topo sort: B before A (A depends on B)")
assert(cIdx < dIdx, "Topo sort: C before D (D depends on C)")
console.log(`   Order: ${sorted.map((t) => t.title).join(" → ")}`)

// ── Test 11: Transitive Dependencies/Dependents ─────────────────────

console.log("\n11. getTransitiveDependencies() / getTransitiveDependents()")

const transDepA = getTransitiveDependencies(db, taskA.id)
assert(transDepA.includes(taskB.id), "A's transitive deps include B")
assert(transDepA.includes(taskC.id), "A's transitive deps include C (via B)")
assert(transDepA.length === 2, "A has 2 transitive dependencies (B, C)")

const transDeptC = getTransitiveDependents(db, taskC.id)
assert(transDeptC.includes(taskB.id), "C's transitive dependents include B")
assert(transDeptC.includes(taskA.id), "C's transitive dependents include A (via B)")
assert(transDeptC.includes(taskD.id), "C's transitive dependents include D")
assert(transDeptC.length === 3, "C has 3 transitive dependents (B, A, D)")

// ── Test 12: removeDependency ───────────────────────────────────────

console.log("\n12. removeDependency()")
removeDependency(db, taskD.id, taskC.id)
const detailD = getTaskDetail(db, taskD.id)
assert(detailD.dependsOn.length === 0, "D has no dependencies after removal")

// ── Cleanup & Summary ───────────────────────────────────────────────

sqlite.close()

console.log("\n=== Summary ===")
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)

if (failed > 0) {
  console.log(`\n❌ ${failed} test(s) failed!`)
  process.exit(1)
} else {
  console.log(`\n✅ All ${passed} tests passed!`)
}
