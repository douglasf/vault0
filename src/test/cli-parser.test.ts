import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { parseArgs, runCli } from "../cli/index.js"
import { cmdView, cmdEdit, cmdMove } from "../cli/commands.js"
import { createTestDb, closeTestDb, type TestDb } from "./helpers.js"
import { tasks } from "../db/schema.js"

// ═══════════════════════════════════════════════════════════════════
// parseArgs — pure function tests (no DB needed)
//
// Note: parseArgs now only extracts positional args, flags, and format.
// Subcommand routing is handled by the router in runCli.
// ═══════════════════════════════════════════════════════════════════

describe("parseArgs", () => {
  // ── Positional extraction ──────────────────────────────────────

  describe("positional extraction", () => {
    test("extracts single positional arg", () => {
      const result = parseArgs(["ABC12345"])
      expect(result.positional).toEqual(["ABC12345"])
    })

    test("extracts multiple positional args", () => {
      const result = parseArgs(["ID1", "ID2"])
      expect(result.positional).toEqual(["ID1", "ID2"])
    })

    test("no positionals when only flags given", () => {
      const result = parseArgs(["--status", "todo"])
      expect(result.positional).toEqual([])
    })

    test("positional before flags", () => {
      const result = parseArgs(["ABC12345", "--title", "Updated"])
      expect(result.positional).toEqual(["ABC12345"])
      expect(result.flags.title).toBe("Updated")
    })

    test("positional args interspersed with flags", () => {
      const result = parseArgs(["ID1", "--format", "json", "ID2"])
      expect(result.positional).toEqual(["ID1", "ID2"])
      expect(result.format).toBe("json")
    })
  })

  // ── Flag parsing (--key value) ─────────────────────────────────

  describe("flag parsing", () => {
    test("parses --key value flags", () => {
      const result = parseArgs(["--title", "My Task"])
      expect(result.flags.title).toBe("My Task")
    })

    test("parses multiple flags", () => {
      const result = parseArgs(["--title", "My Task", "--priority", "high", "--status", "todo"])
      expect(result.flags.title).toBe("My Task")
      expect(result.flags.priority).toBe("high")
      expect(result.flags.status).toBe("todo")
    })

    test("parses --board flag", () => {
      const result = parseArgs(["--board", "BOARD123"])
      expect(result.flags.board).toBe("BOARD123")
    })

    test("parses --search flag with spaces", () => {
      const result = parseArgs(["--search", "fix login bug"])
      expect(result.flags.search).toBe("fix login bug")
    })

    test("parses --description flag", () => {
      const result = parseArgs(["--title", "Task", "--description", "A long description"])
      expect(result.flags.description).toBe("A long description")
    })

    test("parses --tags flag", () => {
      const result = parseArgs(["--title", "Task", "--tags", "frontend,bug,urgent"])
      expect(result.flags.tags).toBe("frontend,bug,urgent")
    })

    test("parses --source and --source-ref flags", () => {
      const result = parseArgs(["--title", "Task", "--source", "opencode", "--source-ref", "session-123"])
      expect(result.flags.source).toBe("opencode")
      expect(result.flags["source-ref"]).toBe("session-123")
    })

    test("parses --dep-add flag", () => {
      const result = parseArgs(["TASK1", "--dep-add", "TASK2"])
      expect(result.positional).toEqual(["TASK1"])
      expect(result.flags["dep-add"]).toBe("TASK2")
    })

    test("parses --dep-remove flag", () => {
      const result = parseArgs(["TASK1", "--dep-remove", "TASK2"])
      expect(result.positional).toEqual(["TASK1"])
      expect(result.flags["dep-remove"]).toBe("TASK2")
    })
  })

  // ── Boolean flags ──────────────────────────────────────────────

  describe("boolean flags", () => {
    test("--blocked without value defaults to 'true'", () => {
      const result = parseArgs(["--blocked"])
      expect(result.flags.blocked).toBe("true")
    })

    test("--ready without value defaults to 'true'", () => {
      const result = parseArgs(["--ready"])
      expect(result.flags.ready).toBe("true")
    })

    test("--all without value defaults to 'true'", () => {
      const result = parseArgs(["--all"])
      expect(result.flags.all).toBe("true")
    })

    test("--help without value defaults to 'true'", () => {
      const result = parseArgs(["--help"])
      expect(result.flags.help).toBe("true")
    })

    test("--dep-list without value defaults to 'true'", () => {
      const result = parseArgs(["TASK1", "--dep-list"])
      expect(result.flags["dep-list"]).toBe("true")
    })

    test("--blocked with explicit value uses that value", () => {
      const result = parseArgs(["--blocked", "false"])
      expect(result.flags.blocked).toBe("false")
    })

    test("--ready with explicit value uses that value", () => {
      const result = parseArgs(["--ready", "false"])
      expect(result.flags.ready).toBe("false")
    })

    test("--blocked followed by another flag defaults to 'true'", () => {
      const result = parseArgs(["--blocked", "--status", "todo"])
      expect(result.flags.blocked).toBe("true")
      expect(result.flags.status).toBe("todo")
    })

    test("--ready followed by another flag defaults to 'true'", () => {
      const result = parseArgs(["--ready", "--priority", "high"])
      expect(result.flags.ready).toBe("true")
      expect(result.flags.priority).toBe("high")
    })

    test("multiple boolean flags together", () => {
      const result = parseArgs(["--blocked", "--ready"])
      expect(result.flags.blocked).toBe("true")
      expect(result.flags.ready).toBe("true")
    })
  })

  // ── Format extraction and defaults ─────────────────────────────

  describe("format extraction", () => {
    test("defaults format to 'text' when not specified", () => {
      const result = parseArgs([])
      expect(result.format).toBe("text")
    })

    test("extracts --format json", () => {
      const result = parseArgs(["--format", "json"])
      expect(result.format).toBe("json")
    })

    test("extracts --format text", () => {
      const result = parseArgs(["--format", "text"])
      expect(result.format).toBe("text")
    })

    test("removes format from flags object", () => {
      const result = parseArgs(["--format", "json"])
      expect(result.format).toBe("json")
      expect(result.flags.format).toBeUndefined()
    })

    test("unknown format value defaults to 'text'", () => {
      const result = parseArgs(["--format", "yaml"])
      expect(result.format).toBe("text")
    })

    test("format works with other flags", () => {
      const result = parseArgs(["--status", "todo", "--format", "json", "--priority", "high"])
      expect(result.format).toBe("json")
      expect(result.flags.status).toBe("todo")
      expect(result.flags.priority).toBe("high")
      expect(result.flags.format).toBeUndefined()
    })
  })

  // ── Edge cases ─────────────────────────────────────────────────

  describe("edge cases", () => {
    test("empty args produce empty results", () => {
      const result = parseArgs([])
      expect(result.positional).toEqual([])
      expect(result.flags).toEqual({})
      expect(result.format).toBe("text")
    })

    test("trailing flag with no value gets empty string", () => {
      const result = parseArgs(["--title"])
      expect(result.flags.title).toBe("")
    })

    test("flag at end (non-boolean) with no value gets empty string", () => {
      const result = parseArgs(["TASK1", "--priority"])
      expect(result.flags.priority).toBe("")
    })

    test("only flags, no positional", () => {
      const result = parseArgs(["--format", "json"])
      expect(result.positional).toEqual([])
      expect(result.format).toBe("json")
    })

    test("complex real-world command: add with many flags", () => {
      const result = parseArgs([
        "--title", "Fix login bug",
        "--priority", "high",
        "--type", "bug",
        "--status", "todo",
        "--tags", "auth,frontend",
        "--source", "opencode",
        "--source-ref", "session-abc",
        "--format", "json",
      ])
      expect(result.flags.title).toBe("Fix login bug")
      expect(result.flags.priority).toBe("high")
      expect(result.flags.type).toBe("bug")
      expect(result.flags.status).toBe("todo")
      expect(result.flags.tags).toBe("auth,frontend")
      expect(result.flags.source).toBe("opencode")
      expect(result.flags["source-ref"]).toBe("session-abc")
      expect(result.format).toBe("json")
      expect(result.flags.format).toBeUndefined()
    })

    test("complex real-world command: edit with dep-add and format", () => {
      const result = parseArgs(["TASK_ABC", "--dep-add", "TASK_DEF", "--format", "json"])
      expect(result.positional).toEqual(["TASK_ABC"])
      expect(result.flags["dep-add"]).toBe("TASK_DEF")
      expect(result.format).toBe("json")
    })

    test("list with boolean and value flags mixed", () => {
      const result = parseArgs(["--status", "in_progress", "--blocked", "--format", "json"])
      expect(result.flags.status).toBe("in_progress")
      expect(result.flags.blocked).toBe("true")
      expect(result.format).toBe("json")
    })

    test("--key=value syntax treats '=' as part of the key (not supported)", () => {
      const result = parseArgs(["--title=hello"])
      expect(result.flags["title=hello"]).toBeDefined()
      expect(result.flags.title).toBeUndefined()
    })

    test("single-dash flags like -t are treated as positional args", () => {
      const result = parseArgs(["-t", "My Task"])
      expect(result.positional).toContain("-t")
      expect(result.positional).toContain("My Task")
    })

    test("value starting with -- is consumed as value for non-boolean flags", () => {
      const result = parseArgs(["--title", "--weird"])
      expect(result.flags.title).toBe("--weird")
    })
  })
})

// ═══════════════════════════════════════════════════════════════════
// resolveTaskId — integration tests via CLI commands
// ═══════════════════════════════════════════════════════════════════

describe("resolveTaskId (via commands)", () => {
  let testDb: TestDb
  let taskId1: string
  let taskId2: string

  beforeEach(() => {
    testDb = createTestDb()

    // Insert test tasks directly so we have known IDs
    testDb.db.insert(tasks).values({
      id: "01AAABBBCCCDDDEEEFFF111222",
      boardId: testDb.boardId,
      title: "First test task",
      status: "todo",
    }).run()

    testDb.db.insert(tasks).values({
      id: "01AAABBBCCCDDDEEEFFF333444",
      boardId: testDb.boardId,
      title: "Second test task",
      status: "in_progress",
    }).run()

    // Two tasks that share a suffix for ambiguity testing
    testDb.db.insert(tasks).values({
      id: "01XXXYYY000AAABBBCCC999888",
      boardId: testDb.boardId,
      title: "Ambiguous task A",
      status: "todo",
    }).run()

    testDb.db.insert(tasks).values({
      id: "01ZZZWWW111AAABBBCCC999888",
      boardId: testDb.boardId,
      title: "Ambiguous task B",
      status: "todo",
    }).run()

    taskId1 = "01AAABBBCCCDDDEEEFFF111222"
    taskId2 = "01AAABBBCCCDDDEEEFFF333444"
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  // ── Exact match ────────────────────────────────────────────────

  test("exact match returns task", () => {
    const result = cmdView(testDb.db, taskId1, "json")
    expect(result.success).toBe(true)
    const data = JSON.parse(result.message)
    expect(data.id).toBe(taskId1)
    expect(data.title).toBe("First test task")
  })

  test("exact match with second task", () => {
    const result = cmdView(testDb.db, taskId2, "json")
    expect(result.success).toBe(true)
    const data = JSON.parse(result.message)
    expect(data.id).toBe(taskId2)
    expect(data.title).toBe("Second test task")
  })

  // ── Suffix match (single match) ───────────────────────────────

  test("suffix match returns the single matching task", () => {
    // "FFF111222" is unique to taskId1
    const result = cmdView(testDb.db, "FFF111222", "json")
    expect(result.success).toBe(true)
    const data = JSON.parse(result.message)
    expect(data.id).toBe(taskId1)
  })

  test("short suffix match works", () => {
    // "111222" is unique to taskId1
    const result = cmdView(testDb.db, "111222", "json")
    expect(result.success).toBe(true)
    const data = JSON.parse(result.message)
    expect(data.id).toBe(taskId1)
  })

  test("suffix match for second task", () => {
    // "333444" is unique to taskId2
    const result = cmdView(testDb.db, "333444", "json")
    expect(result.success).toBe(true)
    const data = JSON.parse(result.message)
    expect(data.id).toBe(taskId2)
  })

  // ── Ambiguous suffix (multiple matches) ────────────────────────
  // resolveTaskId throws when multiple tasks match — errors propagate
  // up through command handlers (caught by the router in runCli)

  test("ambiguous suffix throws error", () => {
    // "CCC999888" matches both ambiguous tasks
    expect(() => cmdView(testDb.db, "CCC999888", "text")).toThrow("Ambiguous")
  })

  test("ambiguous suffix error includes match count", () => {
    expect(() => cmdView(testDb.db, "CCC999888", "text")).toThrow("matches 2 tasks")
  })

  test("ambiguous suffix error suggests using more characters", () => {
    expect(() => cmdView(testDb.db, "999888", "text")).toThrow("Use more characters")
  })

  // ── No match ──────────────────────────────────────────────────

  test("no match throws error", () => {
    expect(() => cmdView(testDb.db, "ZZZZZZNOTEXIST", "text")).toThrow("No task found")
  })

  test("no match error includes the ID fragment", () => {
    expect(() => cmdView(testDb.db, "ZZZZZZNOTEXIST", "text")).toThrow("ZZZZZZNOTEXIST")
  })

  test("empty ID returns error from command (before resolveTaskId)", () => {
    // Empty string is caught by cmdView's own validation, not resolveTaskId
    const result = cmdView(testDb.db, "", "text")
    expect(result.success).toBe(false)
    expect(result.message).toContain("Task ID is required")
  })

  // ── resolveTaskId through other commands ───────────────────────

  test("resolveTaskId works through cmdEdit", () => {
    const result = cmdEdit(testDb.db, "FFF111222", { title: "Updated title" }, "json")
    expect(result.success).toBe(true)
    const data = JSON.parse(result.message)
    expect(data.title).toBe("Updated title")
  })

  test("resolveTaskId works through cmdMove with suffix", () => {
    const result = cmdMove(testDb.db, "FFF333444", { status: "done" }, "json")
    expect(result.success).toBe(true)
    const data = JSON.parse(result.message)
    expect(data.id).toBe(taskId2)
    expect(data.status).toBe("done")
  })

  test("no match through cmdEdit throws error", () => {
    expect(() => cmdEdit(testDb.db, "NONEXISTENT", { title: "Nope" }, "text")).toThrow("No task found")
  })
})

// ═══════════════════════════════════════════════════════════════════
// parseArgs — edge cases: malformed flags, special chars
// ═══════════════════════════════════════════════════════════════════

describe("parseArgs edge cases", () => {
  // ── Special characters in values ──────────────────────────────

  describe("special characters in values", () => {
    test("unicode/emoji in title", () => {
      const result = parseArgs(["--title", "Fix 🐛 bug"])
      expect(result.flags.title).toBe("Fix 🐛 bug")
    })

    test("empty string value for title", () => {
      const result = parseArgs(["--title", ""])
      expect(result.flags.title).toBe("")
    })

    test("value with newlines", () => {
      const result = parseArgs(["--description", "line1\nline2"])
      expect(result.flags.description).toBe("line1\nline2")
    })

    test("value with special regex characters", () => {
      const result = parseArgs(["--title", "Fix (.*) [issue]"])
      expect(result.flags.title).toBe("Fix (.*) [issue]")
    })
  })
})

// ═══════════════════════════════════════════════════════════════════
// runCli — integration tests
// ═══════════════════════════════════════════════════════════════════

describe("runCli integration", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("unknown entity returns exit code 1", () => {
    const code = runCli("frobnicate", [], testDb.db)
    expect(code).toBe(1)
  })

  test("task with unknown subcommand returns exit code 1", () => {
    const code = runCli("task", ["frobnicate"], testDb.db)
    expect(code).toBe(1)
  })

  test("task with no subcommand returns exit code 1", () => {
    const code = runCli("task", [], testDb.db)
    expect(code).toBe(1)
  })

  test("task help returns exit code 0", () => {
    const code = runCli("task", ["help"], testDb.db)
    expect(code).toBe(0)
  })

  test("task --help returns exit code 0", () => {
    const code = runCli("task", ["--help"], testDb.db)
    expect(code).toBe(0)
  })

  test("task add success returns exit code 0", () => {
    const code = runCli("task", ["add", "--title", "Test task"], testDb.db)
    expect(code).toBe(0)
  })

  test("task add without title returns exit code 1", () => {
    const code = runCli("task", ["add"], testDb.db)
    expect(code).toBe(1)
  })

  test("task view with non-existent ID returns exit code 1 (error caught)", () => {
    const code = runCli("task", ["view", "NONEXISTENT999"], testDb.db)
    expect(code).toBe(1)
  })

  test("unknown task subcommand returns exit code 1", () => {
    const code = runCli("task", ["dep"], testDb.db)
    expect(code).toBe(1)
  })

  test("board list returns exit code 0", () => {
    const code = runCli("board", ["list"], testDb.db)
    expect(code).toBe(0)
  })

  test("board unknown subcommand returns exit code 1", () => {
    const code = runCli("board", ["frobnicate"], testDb.db)
    expect(code).toBe(1)
  })

  test("task edit --help returns exit code 0", () => {
    const code = runCli("task", ["edit", "--help"], testDb.db)
    expect(code).toBe(0)
  })
})
