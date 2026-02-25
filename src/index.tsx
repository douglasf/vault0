#!/usr/bin/env bun
import { createCliRenderer, ConsolePosition } from "@opentui/core"
import { createRoot } from "@opentui/react"
import React from "react"
import { App } from "./components/App.js"
import { initDatabase, markDbClosed } from "./db/connection.js"
import { seedDefaultBoard } from "./db/seed.js"
import { runCli } from "./cli/index.js"
import { runEmbeddedMigrations } from "./db/migrations.js"
import { ensureGlobalConfig, loadConfig } from "./lib/config.js"
import { initTheme } from "./lib/theme.js"
import { errorMessage } from "./lib/format.js"
import { renderExitScreen } from "./lib/exit-screen.js"
import { existsSync, mkdirSync, appendFileSync, writeFileSync, readFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"

const VERSION = "0.1.0"

// ── Single Instance Lock ────────────────────────────────────────────────

/**
 * Attempt to acquire a lockfile for the TUI. Returns a release function
 * if the lock was acquired, or null if another instance is already running.
 * Uses PID-based stale lock detection: if the PID in the lockfile is no
 * longer running, the lock is considered stale and can be overwritten.
 */
function acquireTuiLock(repoRoot: string, watchMode = false): (() => void) | null {
  const vault0Dir = join(repoRoot, ".vault0")
  const lockPath = join(vault0Dir, "tui.lock")

  mkdirSync(vault0Dir, { recursive: true })

  // Atomic lock acquisition using O_EXCL (wx flag) to eliminate TOCTOU race.
  // writeFileSync with { flag: "wx" } fails if the file already exists,
  // making check-and-create a single atomic operation.
  try {
    writeFileSync(lockPath, String(process.pid), { flag: "wx" })
    // Successfully created — we own the lock
  } catch {
    // Lock file exists — check if it's stale or held by an active process
    let existingPid: number | undefined
    try {
      const content = readFileSync(lockPath, "utf-8").trim()
      existingPid = Number.parseInt(content, 10)
    } catch {
      // Can't read lock file — try to replace it
    }

    if (existingPid && !Number.isNaN(existingPid)) {
      if (existingPid === process.pid) {
        // Same process (e.g. bun --watch re-executing) — stale lock, replace it
      } else {
        try {
          process.kill(existingPid, 0) // signal 0 = existence check
          if (watchMode) {
            // In watch mode, the previous instance may still be shutting down.
            // Send SIGTERM and give it a moment to exit gracefully.
            try { process.kill(existingPid, "SIGTERM") } catch { /* already dying */ }
            Bun.sleepSync(200)
            try {
              process.kill(existingPid, 0)
              return null // genuinely still running
            } catch {
              // Dead now — proceed to replace lock
            }
          } else {
            // Process is alive — another TUI instance is running
            return null
          }
        } catch {
          // Process is dead — stale lock
        }
      }
    }

    // Stale or unreadable lock — remove and re-acquire atomically
    try { unlinkSync(lockPath) } catch { /* already gone */ }
    try {
      writeFileSync(lockPath, String(process.pid), { flag: "wx" })
    } catch {
      // Another instance grabbed the lock between our unlink and write
      return null
    }
  }

  return () => {
    try {
      // Only remove if it's still our lock (guard against race)
      const content = readFileSync(lockPath, "utf-8").trim()
      if (content === String(process.pid)) {
        unlinkSync(lockPath)
      }
    } catch {
      // Silent — lock file may already be gone
    }
  }
}

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

    // Initialize config and database
    try {
      ensureGlobalConfig()
      const _config = loadConfig(repoRoot)
      initTheme(_config.theme?.name, _config.theme?.appearance)
      const { db, sqlite } = initDatabase(repoRoot)
      runEmbeddedMigrations(sqlite)
      seedDefaultBoard(db)

      const exitCode = runCli(entity, cliArgs, db)

      sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)")
      sqlite.close()
      process.exit(exitCode)
    } catch (error) {
      const message = errorMessage(error)
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
    // ── Single instance guard ───────────────────────────────────────────
    const isWatchMode = process.env.BUN_WATCH === "1"
    const releaseLock = acquireTuiLock(repoRoot, isWatchMode)
    if (!releaseLock) {
      console.error("Error: Another Vault0 TUI instance is already running for this directory.")
      console.error(`  Directory: ${repoRoot}`)
      console.error("  Running multiple TUI instances against the same database can cause crashes.")
      console.error("  Close the other instance first, or delete .vault0/tui.lock if it's stale.")
      process.exit(1)
    }

    // Clean up the lock file when the process exits for any reason.
    // Using the 'exit' event instead of signal handlers avoids conflicts with:
    //   - bun --watch (which sends SIGTERM to restart — we must not call process.exit() ourselves)
    //   - OpenTUI's exitOnCtrlC (which handles SIGINT gracefully for terminal cleanup)
    process.on("exit", () => {
      releaseLock()
    })

    // Initialize config
    ensureGlobalConfig()
    const _config = loadConfig(repoRoot)
    initTheme(_config.theme?.name, _config.theme?.appearance)

    // Initialize database
    const { db, sqlite, dbPath } = initDatabase(repoRoot)
    runEmbeddedMigrations(sqlite)
    seedDefaultBoard(db)

    // ── Periodic WAL checkpoint ───────────────────────────────────────────
    // SQLite's wal_autocheckpoint can be starved when the TUI holds read
    // transactions during render cycles.  Force a PASSIVE checkpoint every
    // 5 minutes so the WAL file never grows unboundedly (root cause of the
    // 10 GB peak-memory segfault after multi-day uptime).
    const WAL_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
    const walCheckpointTimer = setInterval(() => {
      try {
        sqlite.exec("PRAGMA wal_checkpoint(PASSIVE)")
      } catch {
        // Checkpoint failure is non-fatal — will retry next interval
      }
    }, WAL_CHECKPOINT_INTERVAL_MS)
    // Unref the timer so it doesn't keep the process alive during
    // bun --watch restarts (prevents stale process blocking the new instance)
    if (typeof walCheckpointTimer === "object" && "unref" in walCheckpointTimer) {
      walCheckpointTimer.unref()
    }

    // ── Launch OpenTUI renderer ───────────────────────────────────────────
    // OpenTUI handles alternate screen, raw mode, and cleanup automatically.
    const renderer = await createCliRenderer({
      exitOnCtrlC: true,
      useAlternateScreen: true,
      useMouse: true,
      targetFps: 30,
      consoleOptions: {
        position: ConsolePosition.BOTTOM,
        sizePercent: 30,
      },
      onDestroy: () => {
        clearInterval(walCheckpointTimer)

        // Mark DB as closed BEFORE closing — prevents in-flight React renders
        // from accessing the closed handle (which causes Bun segfaults)
        markDbClosed()

        try {
          renderExitScreen()
        } catch {
          // Non-fatal — don't block exit if rendering fails
        }

        sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)")
        sqlite.close()
      },
    })

    // Toggle console overlay with § key
    renderer.keyInput.on("keypress", (key: { raw?: string }) => {
      if (key.raw === "§") {
        renderer.console.toggle()
      }
    })

    // Copy-on-select: automatically copy highlighted text to clipboard via OSC 52
    renderer.on("selection", (selection: { getSelectedText: () => string }) => {
      const text = selection.getSelectedText()
      if (text) {
        renderer.copyToClipboardOSC52(text)
      }
    })

    createRoot(renderer).render(<App db={db} dbPath={dbPath} repoRoot={repoRoot} />)
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
