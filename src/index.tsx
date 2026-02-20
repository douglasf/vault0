#!/usr/bin/env bun
import { render } from "ink"
import React from "react"
import { App } from "./components/App.js"
import { initDatabase } from "./db/connection.js"
import { seedDefaultBoard } from "./db/seed.js"
import { runCli } from "./cli/index.js"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { existsSync, mkdirSync, appendFileSync } from "node:fs"
import { join } from "node:path"

const VERSION = "0.1.0"

// ── CLI Entities (subcommand routing) ───────────────────────────────────

const CLI_ENTITIES = new Set(["task", "board"])

// ── CLI Argument Parsing ────────────────────────────────────────────────

function printHelp() {
  console.log(`
Vault0 — Terminal Kanban Board v${VERSION}

Usage:
  vault0                          Launch interactive board (TUI)
  vault0 task <command> [options] Manage tasks via CLI
  vault0 board <command>          Manage boards via CLI
  vault0 --path DIR               Launch board for specific directory
  vault0 --help                   Show this help message
  vault0 --version                Show version

CLI Examples:
  vault0 task add --title "Fix login bug" --priority high
  vault0 task list --status todo
  vault0 task list --format json
  vault0 task view abc12345
  vault0 task move abc12345 --status done
  vault0 task complete abc12345
  vault0 task dep add abc12345 --on def67890

TUI Examples:
  vault0                    # Launch in current working directory
  vault0 --path ~/myproject # Launch for a specific project

Run "vault0 task help" for full CLI command reference.

Data stored in: .vault0/vault0.db (per-repo, git-ignored)
Keyboard Shortcuts: Press '?' inside the TUI for a complete list.
`)
}

function printVersion() {
  console.log(`Vault0 v${VERSION}`)
}

// ── Main Entry Point ────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  let repoRoot = process.cwd()
  let showHelp = false
  let showVersion = false

  // ── Detect CLI subcommand mode ──────────────────────────────────────
  // If the first argument is a known entity (task, board), run in CLI mode
  // Extract --path from anywhere in the args for CLI mode too

  const firstArg = args[0]
  const isCliMode = firstArg !== undefined && CLI_ENTITIES.has(firstArg)

  if (isCliMode) {
    // In CLI mode, extract --path if present anywhere in the args
    const cliArgs = [...args]
    const entity = cliArgs.shift() as string
    const pathIdx = cliArgs.indexOf("--path")
    if (pathIdx !== -1 && cliArgs[pathIdx + 1]) {
      repoRoot = cliArgs[pathIdx + 1]
      cliArgs.splice(pathIdx, 2)
    }

    // Initialize database (no TUI, minimal output)
    try {
      const { db, sqlite } = initDatabase(repoRoot)
      const migrationsPath = new URL("../drizzle", import.meta.url).pathname
      if (existsSync(migrationsPath)) {
        try {
          migrate(db, { migrationsFolder: migrationsPath })
        } catch {
          // Silent — migrations already applied
        }
      }
      seedDefaultBoard(db)

      const exitCode = runCli(entity, cliArgs, db)

      sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)")
      sqlite.close()
      process.exit(exitCode)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Error: ${message}`)
      process.exit(1)
    }
    return
  }

  // ── TUI mode — original argument parsing ────────────────────────────

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--path" && args[i + 1]) {
      repoRoot = args[++i]
    } else if (args[i] === "--help" || args[i] === "-h") {
      showHelp = true
    } else if (args[i] === "--version" || args[i] === "-v") {
      showVersion = true
    } else {
      console.error(`Unknown argument: ${args[i]}`)
      printHelp()
      process.exit(1)
    }
  }

  // Handle special modes
  if (showHelp) {
    printHelp()
    process.exit(0)
  }

  if (showVersion) {
    printVersion()
    process.exit(0)
  }

  // Validate repo root exists
  if (!existsSync(repoRoot)) {
    console.error(`Error: Directory not found: ${repoRoot}`)
    process.exit(1)
  }

  // Check terminal size
  const columns = process.stdout.columns || 80
  const rows = process.stdout.rows || 24

  if (columns < 80 || rows < 24) {
    console.warn(`Warning: Terminal size ${columns}x${rows} is smaller than recommended 80x24`)
    console.warn("  UI may be degraded or unreadable\n")
  }

  try {
    // Initialize database
    console.error("Initializing database...")
    const { db, sqlite, dbPath } = initDatabase(repoRoot)

    // Run migrations
    console.error("Running migrations...")
    const migrationsPath = new URL("../drizzle", import.meta.url).pathname
    if (existsSync(migrationsPath)) {
      try {
        migrate(db, { migrationsFolder: migrationsPath })
      } catch (migError) {
        console.error(`Warning: Migration issue: ${migError instanceof Error ? migError.message : String(migError)}`)
        console.error("  Continuing with database as-is...\n")
      }
    }

    // Seed default board
    console.error("Setting up default board...")
    seedDefaultBoard(db)

    console.error("Starting Vault0...\n")

    // Launch TUI
    const { waitUntilExit } = render(<App db={db} dbPath={dbPath} />, {
      exitOnCtrlC: true,
    })

    // Cleanup on exit
    await waitUntilExit()
    console.error("\nCleaning up...")
    sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)")
    sqlite.close()
    console.error("Vault0 closed. Goodbye!")
  } catch (error) {
    console.error("\nError starting Vault0:")

    if (error instanceof Error) {
      const message = error.message

      // Check for common error patterns and provide actionable messages
      if (message.includes("EACCES")) {
        console.error(`  Permission denied: cannot write to ${repoRoot}/.vault0`)
        console.error("  Check directory permissions and try again.")
      } else if (message.includes("database") || message.includes("SQLite")) {
        console.error(`  Database error: ${message}`)
        console.error("  Try deleting .vault0/vault0.db and relaunching.")
      } else {
        console.error(`  ${message}`)
      }

      // Log full error to file for debugging
      const errorLogPath = join(repoRoot, ".vault0", "error.log")
      try {
        mkdirSync(join(repoRoot, ".vault0"), { recursive: true })
        const timestamp = new Date().toISOString()
        const logEntry = `[${timestamp}] ${error.stack || error.message}\n`
        appendFileSync(errorLogPath, logEntry)
        console.error(`\n  Full error logged to: ${errorLogPath}`)
      } catch {
        // Silent fail on error logging — don't mask the original error
      }
    } else {
      console.error(`  ${String(error)}`)
    }

    process.exit(1)
  }
}

// Run main
main()
