import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import * as schema from "../db/schema.js"
import { runEmbeddedMigrations } from "../db/migrations.js"
import { seedDefaultBoard } from "../db/seed.js"
import { boards } from "../db/schema.js"
import type { Vault0Database } from "../db/connection.js"

export interface TestDb {
  db: Vault0Database
  sqlite: Database
  boardId: string
}

/**
 * Creates a fresh in-memory SQLite database with Drizzle, runs migrations,
 * and seeds a default board. Each call returns an isolated DB instance.
 */
export function createTestDb(): TestDb {
  const sqlite = new Database(":memory:")

  // Enable foreign keys (matches production connection.ts PRAGMAs)
  sqlite.exec("PRAGMA foreign_keys = ON")

  // Run embedded migrations
  runEmbeddedMigrations(sqlite)

  // Wrap with Drizzle ORM
  const db = drizzle({ client: sqlite, schema })

  // Seed default board
  seedDefaultBoard(db)

  // Retrieve the board ID
  const board = db.select().from(boards).limit(1).get()
  if (!board) {
    throw new Error("Failed to seed default board")
  }

  return { db, sqlite, boardId: board.id }
}

/**
 * Closes the SQLite database connection. Call in afterEach/afterAll for cleanup.
 */
export function closeTestDb(sqlite: Database): void {
  sqlite.close()
}
