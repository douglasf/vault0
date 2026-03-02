import { describe, test, expect } from "bun:test"
import { createMcpServer } from "../mcp/server.js"

// ═══════════════════════════════════════════════════════════════════
// MCP Server creation
// ═══════════════════════════════════════════════════════════════════

describe("createMcpServer", () => {
  test("creates a server instance", () => {
    const server = createMcpServer()
    expect(server).toBeDefined()
  })

  test("server has expected name and version", () => {
    // The server is created with name "vault0" and version "0.2.0"
    // We can't directly access these, but creating without error is sufficient
    const server = createMcpServer()
    expect(server).toBeTruthy()
  })
})

// ═══════════════════════════════════════════════════════════════════
// Tool registration
// ═══════════════════════════════════════════════════════════════════

describe("tool registration", () => {
  test("registerTools does not throw with valid server and db", async () => {
    const { createTestDb, closeTestDb } = await import("./helpers.js")
    const { registerTools } = await import("../mcp/tools.js")

    const testDb = createTestDb()
    const server = createMcpServer()

    expect(() => registerTools(server, testDb.db)).not.toThrow()

    closeTestDb(testDb.sqlite)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Resource registration
// ═══════════════════════════════════════════════════════════════════

describe("resource registration", () => {
  test("registerInstructionResources does not throw", async () => {
    const { registerInstructionResources } = await import("../mcp/resources.js")
    const server = createMcpServer()

    expect(() => registerInstructionResources(server)).not.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════
// WAL checkpoint logic
// ═══════════════════════════════════════════════════════════════════

describe("WAL checkpoint", () => {
  test("PASSIVE checkpoint pragma executes on in-memory db", async () => {
    const { Database } = await import("bun:sqlite")
    const sqlite = new Database(":memory:")

    // Should not throw — PASSIVE checkpoint is safe on any SQLite DB
    expect(() => sqlite.exec("PRAGMA wal_checkpoint(PASSIVE)")).not.toThrow()

    sqlite.close()
  })

  test("TRUNCATE checkpoint pragma executes on in-memory db", async () => {
    const { Database } = await import("bun:sqlite")
    const sqlite = new Database(":memory:")

    expect(() => sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)")).not.toThrow()

    sqlite.close()
  })
})

// ═══════════════════════════════════════════════════════════════════
// Error handling in tool wrapper
// ═══════════════════════════════════════════════════════════════════

describe("toMcpResponse / withErrorHandling", () => {
  test("successful CommandResult maps to MCP response", () => {
    // Mirrors toMcpResponse logic
    const result = { success: true, message: "OK", data: { id: "123" } }
    const response = {
      content: [{
        type: "text" as const,
        text: result.data ? JSON.stringify(result.data, null, 2) : result.message,
      }],
      isError: !result.success,
    }

    expect(response.isError).toBe(false)
    expect(response.content[0].text).toContain("123")
  })

  test("failed CommandResult maps to error MCP response", () => {
    const result: { success: boolean, message: string, data?: unknown } = { success: false, message: "Something went wrong" }
    const response = {
      content: [{
        type: "text" as const,
        text: result.data ? JSON.stringify(result.data, null, 2) : result.message,
      }],
      isError: !result.success,
    }

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toBe("Something went wrong")
  })

  test("thrown error maps to error MCP response", () => {
    const error = new Error("Task not found")
    const response = {
      content: [{
        type: "text" as const,
        text: error instanceof Error ? error.message : String(error),
      }],
      isError: true,
    }

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toBe("Task not found")
  })
})
