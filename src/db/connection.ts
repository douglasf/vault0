import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import * as schema from "./schema.js"
import { existsSync, mkdirSync, appendFileSync } from "node:fs"
import { join } from "node:path"

export function initDatabase(repoRoot: string) {
  const vault0Dir = join(repoRoot, ".vault0")
  const dbPath = join(vault0Dir, "vault0.db")
  const gitignorePath = join(vault0Dir, ".gitignore")

  // Create .vault0/ directory
  if (!existsSync(vault0Dir)) {
    mkdirSync(vault0Dir, { recursive: true })
  }

  // Ensure .vault0 contents are gitignored
  if (!existsSync(gitignorePath)) {
    appendFileSync(gitignorePath, "*\n")
  }

  // Open SQLite database
  const sqlite = new Database(dbPath)

  // Optimal PRAGMAs for TUI workload
  sqlite.exec("PRAGMA journal_mode = WAL")
  sqlite.exec("PRAGMA synchronous = NORMAL")
  sqlite.exec("PRAGMA foreign_keys = ON")
  sqlite.exec("PRAGMA busy_timeout = 5000")
  sqlite.exec("PRAGMA cache_size = -8000") // 8MB — conservative for long-running TUI
  sqlite.exec("PRAGMA wal_autocheckpoint = 100") // Checkpoint every 100 pages (~400KB) to prevent WAL bloat
  sqlite.exec("PRAGMA mmap_size = 0") // Disable mmap — prevents WAL from inflating process RSS

  // Wrap with Drizzle ORM
  const db = drizzle({ client: sqlite, schema })

  return { db, sqlite, dbPath }
}

export type Vault0Database = ReturnType<typeof initDatabase>["db"]
