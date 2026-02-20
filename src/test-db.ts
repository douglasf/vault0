/**
 * Minimal test script for Step 2 database setup.
 *
 * Usage: node --loader ts-node/esm src/test-db.ts
 *        or: bun src/test-db.ts
 *
 * This script:
 * 1. Initializes the database with migrations
 * 2. Seeds the default board
 * 3. Inserts a test task
 * 4. Queries it back
 * 5. Logs results and exits
 */
import { initDatabase } from "./db/connection.js"
import { seedDefaultBoard } from "./db/seed.js"
import { boards, tasks, taskStatusHistory } from "./db/schema.js"
import { eq } from "drizzle-orm"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"

const repoRoot = process.cwd()

console.log("=== Vault0 Database Test ===\n")

// 1. Initialize database
console.log("1. Initializing database...")
const { db, sqlite } = initDatabase(repoRoot)
console.log("   ✓ Database opened at .vault0/vault0.db")

// 2. Run migrations
console.log("2. Running migrations...")
migrate(db, { migrationsFolder: "./drizzle" })
console.log("   ✓ Migrations applied")

// 3. Seed default board
console.log("3. Seeding default board...")
seedDefaultBoard(db)
const allBoards = db.select().from(boards).all()
console.log(`   ✓ Default board seeded (${allBoards.length} board(s) found)`)
console.log(`     Board: id=${allBoards[0].id}, name="${allBoards[0].name}"`)

// 4. Insert a test task
console.log("4. Inserting test task...")
const boardId = allBoards[0].id
db.insert(tasks).values({
  boardId,
  title: "Test task from Step 2",
  description: "Verifying database schema works correctly",
  status: "todo",
  priority: "high",
  source: "manual",
  tags: ["test", "step-2"],
}).run()

// Also insert a status history entry
const allTasks = db.select().from(tasks).where(eq(tasks.boardId, boardId)).all()
const testTask = allTasks[0]

db.insert(taskStatusHistory).values({
  taskId: testTask.id,
  fromStatus: null,
  toStatus: "todo",
}).run()
console.log(`   ✓ Test task inserted (id=${testTask.id})`)

// 5. Query everything back
console.log("5. Querying data back...")
const queriedTask = db.select().from(tasks).where(eq(tasks.id, testTask.id)).get()
const history = db.select().from(taskStatusHistory).where(eq(taskStatusHistory.taskId, testTask.id)).all()

console.log(`   ✓ Task: "${queriedTask?.title}" [${queriedTask?.status}] priority=${queriedTask?.priority}`)
console.log(`   ✓ Tags: ${JSON.stringify(queriedTask?.tags)}`)
console.log(`   ✓ Status history entries: ${history.length}`)
console.log(`     Latest: ${history[0].fromStatus ?? "(initial)"} → ${history[0].toStatus}`)

// 6. Clean up test data
console.log("6. Cleaning up test data...")
db.delete(taskStatusHistory).where(eq(taskStatusHistory.taskId, testTask.id)).run()
db.delete(tasks).where(eq(tasks.id, testTask.id)).run()
console.log("   ✓ Test task and history cleaned up")

// Final verification
const remainingTasks = db.select().from(tasks).all()
const remainingBoards = db.select().from(boards).all()
console.log("\n=== Summary ===")
console.log(`Boards: ${remainingBoards.length}`)
console.log(`Tasks: ${remainingTasks.length}`)
console.log("Database file: .vault0/vault0.db")
console.log("\n✅ All Step 2 database tests passed!")

sqlite.close()
