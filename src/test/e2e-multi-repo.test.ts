import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import * as schema from "../db/schema.js"
import { initDatabase } from "../db/connection.js"
import { runEmbeddedMigrations } from "../db/migrations.js"
import { seedDefaultBoard } from "../db/seed.js"
import { boards } from "../db/schema.js"
import { cmdAdd, cmdList } from "../cli/commands.js"
import { loadConfig, getAgentInstructions } from "../lib/config.js"
import type { Vault0Config } from "../lib/config.js"

// ── Helpers ─────────────────────────────────────────────────────────────

interface RepoFixture {
  dir: string
  db: ReturnType<typeof initDatabase>["db"]
  sqlite: Database
  boardId: string
}

function createRepoFixture(): RepoFixture {
  const dir = mkdtempSync(join(tmpdir(), "vault0-e2e-"))
  const { db, sqlite } = initDatabase(dir)
  runEmbeddedMigrations(sqlite)
  seedDefaultBoard(db)

  const board = db.select().from(boards).limit(1).get()
  if (!board) throw new Error("Failed to seed board")

  return { dir, db, sqlite, boardId: board.id }
}

function cleanupRepo(repo: RepoFixture): void {
  repo.sqlite.close()
  rmSync(repo.dir, { recursive: true, force: true })
}

// ═══════════════════════════════════════════════════════════════════
// Multi-repo database isolation
// ═══════════════════════════════════════════════════════════════════

describe("multi-repo database isolation", () => {
  let repoA: RepoFixture
  let repoB: RepoFixture

  beforeEach(() => {
    repoA = createRepoFixture()
    repoB = createRepoFixture()
  })

  afterEach(() => {
    cleanupRepo(repoA)
    cleanupRepo(repoB)
  })

  test("each repo gets its own database file in .vault0/", () => {
    const dbPathA = join(repoA.dir, ".vault0", "vault0.db")
    const dbPathB = join(repoB.dir, ".vault0", "vault0.db")

    expect(existsSync(dbPathA)).toBe(true)
    expect(existsSync(dbPathB)).toBe(true)
    expect(dbPathA).not.toBe(dbPathB)
  })

  test("tasks created in repo A do not appear in repo B", () => {
    cmdAdd(repoA.db, { title: "Task in repo A", status: "todo" }, "json")
    cmdAdd(repoA.db, { title: "Another task in A", status: "todo" }, "json")

    cmdAdd(repoB.db, { title: "Task in repo B", status: "todo" }, "json")

    const listA = cmdList(repoA.db, { status: "todo" }, "json")
    const listB = cmdList(repoB.db, { status: "todo" }, "json")

    const tasksA = listA.data as unknown[]
    const tasksB = listB.data as unknown[]

    expect(tasksA.length).toBe(2)
    expect(tasksB.length).toBe(1)
  })

  test("boards are independent across repos", () => {
    expect(repoA.boardId).toBeDefined()
    expect(repoB.boardId).toBeDefined()
    // Different ULID-based IDs (extremely unlikely to collide)
    expect(repoA.boardId).not.toBe(repoB.boardId)
  })

  test("modifying repo A does not affect repo B state", () => {
    // Add tasks to both
    cmdAdd(repoA.db, { title: "A-task", status: "backlog" }, "json")
    cmdAdd(repoB.db, { title: "B-task", status: "backlog" }, "json")

    // Add more to A only
    cmdAdd(repoA.db, { title: "A-task-2", status: "backlog" }, "json")
    cmdAdd(repoA.db, { title: "A-task-3", status: "backlog" }, "json")

    // Verify B is unchanged
    const listB = cmdList(repoB.db, {}, "json")
    const tasksB = listB.data as unknown[]
    expect(tasksB.length).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Working directory isolation
// ═══════════════════════════════════════════════════════════════════

describe("working directory isolation", () => {
  let repoA: RepoFixture
  let repoB: RepoFixture

  beforeEach(() => {
    repoA = createRepoFixture()
    repoB = createRepoFixture()
  })

  afterEach(() => {
    cleanupRepo(repoA)
    cleanupRepo(repoB)
  })

  test("initDatabase creates .vault0 directory in the given repo root", () => {
    expect(existsSync(join(repoA.dir, ".vault0"))).toBe(true)
    expect(existsSync(join(repoB.dir, ".vault0"))).toBe(true)
  })

  test("initDatabase creates .gitignore in .vault0", () => {
    expect(existsSync(join(repoA.dir, ".vault0", ".gitignore"))).toBe(true)
    expect(existsSync(join(repoB.dir, ".vault0", ".gitignore"))).toBe(true)
  })

  test("each repo database is fully functional independently", () => {
    // Both can create, list, and view tasks without interference
    const addA = cmdAdd(repoA.db, { title: "Independent A", status: "todo" }, "json")
    const addB = cmdAdd(repoB.db, { title: "Independent B", status: "todo" }, "json")

    expect(addA.success).toBe(true)
    expect(addB.success).toBe(true)

    const listA = cmdList(repoA.db, { status: "todo" }, "json")
    const listB = cmdList(repoB.db, { status: "todo" }, "json")

    expect(listA.success).toBe(true)
    expect(listB.success).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Config discovery isolation
// ═══════════════════════════════════════════════════════════════════

describe("config discovery per repo", () => {
  let repoA: string
  let repoB: string

  beforeEach(() => {
    repoA = mkdtempSync(join(tmpdir(), "vault0-cfg-a-"))
    repoB = mkdtempSync(join(tmpdir(), "vault0-cfg-b-"))
  })

  afterEach(() => {
    rmSync(repoA, { recursive: true, force: true })
    rmSync(repoB, { recursive: true, force: true })
  })

  test("project config in repo A does not affect repo B", () => {
    // Create project config in repo A
    mkdirSync(join(repoA, ".vault0"), { recursive: true })
    const configA: Vault0Config = {
      integrations: {
        opencode: {
          agents: {
            wolf: { instructions: ["repo-a-instruction"] },
          },
        },
      },
    }
    writeFileSync(join(repoA, ".vault0", "config.json"), JSON.stringify(configA))

    // Repo B has no project config
    const loadedA = loadConfig(repoA)
    const loadedB = loadConfig(repoB)

    expect(getAgentInstructions(loadedA, "opencode", "wolf")).toEqual(["repo-a-instruction"])
    expect(getAgentInstructions(loadedB, "opencode", "wolf")).toEqual([])
  })

  test("each repo can have different project configs", () => {
    mkdirSync(join(repoA, ".vault0"), { recursive: true })
    mkdirSync(join(repoB, ".vault0"), { recursive: true })

    writeFileSync(
      join(repoA, ".vault0", "config.json"),
      JSON.stringify({
        integrations: {
          opencode: { agents: { wolf: { instructions: ["strategy-a"] } } },
        },
      } satisfies Vault0Config),
    )

    writeFileSync(
      join(repoB, ".vault0", "config.json"),
      JSON.stringify({
        integrations: {
          opencode: { agents: { wolf: { instructions: ["strategy-b"] } } },
        },
      } satisfies Vault0Config),
    )

    const cfgA = loadConfig(repoA)
    const cfgB = loadConfig(repoB)

    expect(getAgentInstructions(cfgA, "opencode", "wolf")).toEqual(["strategy-a"])
    expect(getAgentInstructions(cfgB, "opencode", "wolf")).toEqual(["strategy-b"])
  })

  test("loadConfig returns empty config for repo without project config", () => {
    const config = loadConfig(repoA)
    expect(config).toBeDefined()
    // No project config means only global config (if any) applies
    // Either way, it should not throw
  })
})

// ═══════════════════════════════════════════════════════════════════
// Simulated session switching (open repo A, switch to repo B)
// ═══════════════════════════════════════════════════════════════════

describe("session switching simulation", () => {
  test("open session in repo A, switch to repo B, verify isolation", () => {
    // Simulate: user opens vault0 in repo A
    const dirA = mkdtempSync(join(tmpdir(), "vault0-switch-a-"))
    const sessionA = initDatabase(dirA)
    runEmbeddedMigrations(sessionA.sqlite)
    const dbA = drizzle({ client: sessionA.sqlite, schema })
    seedDefaultBoard(dbA)

    // Create tasks in repo A
    cmdAdd(dbA, { title: "Repo A feature", status: "todo" }, "json")
    cmdAdd(dbA, { title: "Repo A bug", status: "todo" }, "json")

    const listA = cmdList(dbA, { status: "todo" }, "json")
    expect((listA.data as unknown[]).length).toBe(2)

    // Simulate: user switches to repo B (new session)
    const dirB = mkdtempSync(join(tmpdir(), "vault0-switch-b-"))
    const sessionB = initDatabase(dirB)
    runEmbeddedMigrations(sessionB.sqlite)
    const dbB = drizzle({ client: sessionB.sqlite, schema })
    seedDefaultBoard(dbB)

    // Repo B should be empty
    const listB = cmdList(dbB, { status: "todo" }, "json")
    expect((listB.data as unknown[]).length).toBe(0)

    // Create task in B
    cmdAdd(dbB, { title: "Repo B task", status: "todo" }, "json")
    const listB2 = cmdList(dbB, { status: "todo" }, "json")
    expect((listB2.data as unknown[]).length).toBe(1)

    // Verify repo A is unchanged
    const listA2 = cmdList(dbA, { status: "todo" }, "json")
    expect((listA2.data as unknown[]).length).toBe(2)

    // Cleanup
    sessionA.sqlite.close()
    sessionB.sqlite.close()
    rmSync(dirA, { recursive: true, force: true })
    rmSync(dirB, { recursive: true, force: true })
  })
})
