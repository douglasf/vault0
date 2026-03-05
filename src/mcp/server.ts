import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { initDatabase } from "../db/connection.js"
import { runEmbeddedMigrations } from "../db/migrations.js"
import { seedDefaultBoard } from "../db/seed.js"
import { registerTools } from "./tools.js"
import type { Database } from "bun:sqlite"
import type { Vault0Database } from "../db/connection.js"

// ── WAL Checkpoint ──────────────────────────────────────────────────────

const WAL_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Start periodic WAL checkpoints to prevent database bloat during long MCP sessions.
 * Returns a cleanup function that stops the timer.
 */
function startWalCheckpoints(sqlite: Database): () => void {
  const timer = setInterval(() => {
    try {
      sqlite.exec("PRAGMA wal_checkpoint(PASSIVE)")
    } catch {
      // Checkpoint failure is non-fatal — will retry next interval
    }
  }, WAL_CHECKPOINT_INTERVAL_MS)

  // Unref so the timer doesn't keep the process alive during shutdown
  if (typeof timer === "object" && "unref" in timer) {
    timer.unref()
  }

  return () => clearInterval(timer)
}

// ── Logging ─────────────────────────────────────────────────────────────

/**
 * Redirect console output to stderr so it doesn't corrupt the stdio JSON-RPC stream.
 * MCP uses stdout exclusively for protocol messages.
 */
function setupLogging(): void {
  const stderrWrite = (...args: unknown[]) => {
    const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")
    process.stderr.write(`[vault0-mcp] ${msg}\n`)
  }

  console.log = stderrWrite
  console.info = stderrWrite
  console.warn = stderrWrite
  console.error = stderrWrite
  console.debug = stderrWrite
}

import { VERSION } from "../lib/version.js"

// ── Server Factory ──────────────────────────────────────────────────────

/**
 * Create and configure the vault0 MCP server instance.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "vault0",
    version: VERSION,
  })

  return server
}

// ── MCP Server Entry Point ──────────────────────────────────────────────

export interface McpServerContext {
  db: Vault0Database
  sqlite: Database
  server: McpServer
}

/**
 * Start the vault0 MCP server with stdio transport.
 *
 * This initializes the database, sets up WAL checkpoints, redirects logging
 * to stderr (to keep stdout clean for JSON-RPC), and connects the MCP server
 * to a stdio transport for communication with MCP clients.
 *
 * @param repoRoot - The repository root directory (where .vault0/ lives)
 */
export async function startMcpServer(repoRoot: string): Promise<void> {
  // Redirect all console output to stderr before anything else
  setupLogging()

  console.info(`Starting MCP server for ${repoRoot}`)

  // Initialize database
  let db: Vault0Database
  let sqlite: Database
  try {
    const dbResult = initDatabase(repoRoot)
    db = dbResult.db
    sqlite = dbResult.sqlite
    runEmbeddedMigrations(sqlite)
    seedDefaultBoard(db)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Failed to initialize database: ${message}`)
    process.exit(1)
  }

  // Start periodic WAL checkpoints
  const stopCheckpoints = startWalCheckpoints(sqlite)

  // Create MCP server and register tools
  const server = createMcpServer()
  registerTools(server, db, sqlite)

  // Connect via stdio transport
  const transport = new StdioServerTransport()

  // Graceful shutdown on transport close
  transport.onclose = () => {
    console.info("MCP transport closed, shutting down")
    stopCheckpoints()
    try {
      sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)")
    } catch {
      // Non-fatal — DB may already be closed
    }
    try {
      sqlite.close()
    } catch {
      // Non-fatal
    }
  }

  try {
    await server.connect(transport)
    console.info("MCP server connected and ready")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Failed to start MCP server: ${message}`)
    stopCheckpoints()
    try {
      sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)")
      sqlite.close()
    } catch {
      // Non-fatal
    }
    process.exit(1)
  }
}
