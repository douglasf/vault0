#!/usr/bin/env bun
import { render } from "ink"
import React from "react"
import { App } from "./components/App.js"
import { initDatabase } from "./db/connection.js"
import { seedDefaultBoard } from "./db/seed.js"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { existsSync, readFileSync } from "node:fs"

// Parse CLI arguments
const args = process.argv.slice(2)
let repoRoot = process.cwd()
let showHelp = false
let showVersion = false

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--path" && args[i + 1]) {
    repoRoot = args[++i]
  } else if (args[i] === "--help" || args[i] === "-h") {
    showHelp = true
  } else if (args[i] === "--version" || args[i] === "-v") {
    showVersion = true
  }
}

// Show help
if (showHelp) {
  console.log(`
Vault0 — Terminal Kanban Board

Usage:
  vault0              Launch board in current directory
  vault0 --path DIR   Launch board for specific directory
  vault0 --help       Show this help message
  vault0 --version    Show version

Data stored in: .vault0/vault0.db (per-repo)
  `)
  process.exit(0)
}

// Show version
if (showVersion) {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"))
  console.log(`v${pkg.version}`)
  process.exit(0)
}

// Check terminal size
const { columns = 80, rows = 24 } = process.stdout
if (columns < 80 || rows < 24) {
  console.warn(`Warning: Terminal size ${columns}x${rows} is below recommended 80x24. UI may be degraded.`)
}

try {
  // Initialize database
  const { db, sqlite } = initDatabase(repoRoot)

  // Run migrations
  const migrationsFolder = new URL("../drizzle", import.meta.url).pathname
  if (existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder })
  }

  // Seed default board
  seedDefaultBoard(db)

  // Launch TUI
  const { waitUntilExit } = render(<App db={db} />, {
    exitOnCtrlC: true,
  })

  // Cleanup on exit
  waitUntilExit().then(() => {
    sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)")
    sqlite.close()
  })
} catch (error) {
  console.error("Error initializing Vault0:", error instanceof Error ? error.message : String(error))
  process.exit(1)
}
