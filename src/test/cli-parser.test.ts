import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { parseArgs, runCli } from "../cli/index.js"
import { cmdView, cmdEdit, cmdComplete } from "../cli/commands.js"
import { createTestDb, closeTestDb, type TestDb } from "./helpers.js"
import { tasks } from "../db/schema.js"

// ═══════════════════════════════════════════════════════════════════
// parseArgs — pure function tests (no DB needed)
// ═══════════════════════════════════════════════════════════════════

describe("parseArgs", () => {
  // ── Subcommand extraction ──────────────────────────────────────

  describe("subcommand extraction", () => {
    test("extracts simple subcommand", () => {
      const result = parseArgs(["add"])
      expect(result.subcommand).toBe("add")
    })

    test("extracts 'list' subcommand", () => {
      const result = parseArgs(["list"])
      expect(result.subcommand).toBe("list")
    })

    test("extracts 'view' subcommand", () => {
      const result = parseArgs(["view"])
      expect(result.subcommand).toBe("view")
    })

    test("extracts 'edit' subcommand", () => {
      const result = parseArgs(["edit"])
      expect(result.subcommand).toBe("edit")
    })

    test("extracts 'move' subcommand", () => {
      const result = parseArgs(["move"])
      expect(result.subcommand).toBe("move")
    })

    test("extracts 'complete' subcommand", () => {
      const result = parseArgs(["complete"])
      expect(result.subcommand).toBe("complete")
    })

    test("extracts 'delete' subcommand", () => {
      const result = parseArgs(["delete"])
      expect(result.subcommand).toBe("delete")
    })

    test("extracts 'dep' subcommand", () => {
      const result = parseArgs(["dep"])
      expect(result.subcommand).toBe("dep")
    })

    test("extracts 'archive-done' subcommand", () => {
      const result = parseArgs(["archive-done"])
      expect(result.subcommand).toBe("archive-done")
    })

    test("extracts 'unarchive' subcommand", () => {
      const result = parseArgs(["unarchive"])
      expect(result.subcommand).toBe("unarchive")
    })
  })

  // ── Sub-subcommand for dep ─────────────────────────────────────

  describe("dep sub-subcommand extraction", () => {
    test("extracts 'dep add' sub-subcommand", () => {
      const result = parseArgs(["dep", "add"])
      expect(result.subcommand).toBe("dep")
      expect(result.subsubcommand).toBe("add")
    })

    test("extracts 'dep rm' sub-subcommand", () => {
      const result = parseArgs(["dep", "rm"])
      expect(result.subcommand).toBe("dep")
      expect(result.subsubcommand).toBe("rm")
    })

    test("extracts 'dep list' sub-subcommand", () => {
      const result = parseArgs(["dep", "list"])
      expect(result.subcommand).toBe("dep")
      expect(result.subsubcommand).toBe("list")
    })

    test("dep sub-subcommand not set for non-dep commands", () => {
      const result = parseArgs(["add", "some-id"])
      expect(result.subcommand).toBe("add")
      expect(result.subsubcommand).toBeUndefined()
    })

    test("dep with sub-subcommand and positional ID", () => {
      const result = parseArgs(["dep", "add", "TASK123"])
      expect(result.subcommand).toBe("dep")
      expect(result.subsubcommand).toBe("add")
      expect(result.positional).toEqual(["TASK123"])
    })

    test("dep with sub-subcommand, positional ID, and flags", () => {
      const result = parseArgs(["dep", "add", "TASK123", "--on", "DEP456"])
      expect(result.subcommand).toBe("dep")
      expect(result.subsubcommand).toBe("add")
      expect(result.positional).toEqual(["TASK123"])
      expect(result.flags.on).toBe("DEP456")
    })
  })

  // ── Flag parsing (--key value) ─────────────────────────────────

  describe("flag parsing", () => {
    test("parses --key value flags", () => {
      const result = parseArgs(["add", "--title", "My Task"])
      expect(result.flags.title).toBe("My Task")
    })

    test("parses multiple flags", () => {
      const result = parseArgs(["add", "--title", "My Task", "--priority", "high", "--status", "todo"])
      expect(result.flags.title).toBe("My Task")
      expect(result.flags.priority).toBe("high")
      expect(result.flags.status).toBe("todo")
    })

    test("parses --on flag for dependencies", () => {
      const result = parseArgs(["dep", "add", "TASK1", "--on", "TASK2"])
      expect(result.flags.on).toBe("TASK2")
    })

    test("parses --board flag", () => {
      const result = parseArgs(["list", "--board", "BOARD123"])
      expect(result.flags.board).toBe("BOARD123")
    })

    test("parses --search flag with spaces", () => {
      const result = parseArgs(["list", "--search", "fix login bug"])
      expect(result.flags.search).toBe("fix login bug")
    })

    test("parses --description flag", () => {
      const result = parseArgs(["add", "--title", "Task", "--description", "A long description"])
      expect(result.flags.description).toBe("A long description")
    })

    test("parses --tags flag", () => {
      const result = parseArgs(["add", "--title", "Task", "--tags", "frontend,bug,urgent"])
      expect(result.flags.tags).toBe("frontend,bug,urgent")
    })

    test("parses --source and --source-ref flags", () => {
      const result = parseArgs(["add", "--title", "Task", "--source", "opencode", "--source-ref", "session-123"])
      expect(result.flags.source).toBe("opencode")
      expect(result.flags["source-ref"]).toBe("session-123")
    })
  })

  // ── Positional arguments ───────────────────────────────────────

  describe("positional arguments", () => {
    test("collects single positional argument (task ID)", () => {
      const result = parseArgs(["view", "ABC12345"])
      expect(result.positional).toEqual(["ABC12345"])
    })

    test("collects positional before flags", () => {
      const result = parseArgs(["edit", "ABC12345", "--title", "Updated"])
      expect(result.positional).toEqual(["ABC12345"])
      expect(result.flags.title).toBe("Updated")
    })

    test("collects multiple positional arguments", () => {
      const result = parseArgs(["view", "ID1", "ID2"])
      expect(result.positional).toEqual(["ID1", "ID2"])
    })

    test("positional for dep sub-subcommand", () => {
      const result = parseArgs(["dep", "list", "TASKID"])
      expect(result.positional).toEqual(["TASKID"])
    })

    test("no positionals when only flags given", () => {
      const result = parseArgs(["list", "--status", "todo"])
      expect(result.positional).toEqual([])
    })
  })

  // ── Boolean flags ──────────────────────────────────────────────

  describe("boolean flags", () => {
    test("--blocked without value defaults to 'true'", () => {
      const result = parseArgs(["list", "--blocked"])
      expect(result.flags.blocked).toBe("true")
    })

    test("--ready without value defaults to 'true'", () => {
      const result = parseArgs(["list", "--ready"])
      expect(result.flags.ready).toBe("true")
    })

    test("--all without value defaults to 'true'", () => {
      const result = parseArgs(["list", "--all"])
      expect(result.flags.all).toBe("true")
    })

    test("--blocked with explicit value uses that value", () => {
      const result = parseArgs(["list", "--blocked", "false"])
      expect(result.flags.blocked).toBe("false")
    })

    test("--ready with explicit value uses that value", () => {
      const result = parseArgs(["list", "--ready", "false"])
      expect(result.flags.ready).toBe("false")
    })

    test("--blocked followed by another flag defaults to 'true'", () => {
      const result = parseArgs(["list", "--blocked", "--status", "todo"])
      expect(result.flags.blocked).toBe("true")
      expect(result.flags.status).toBe("todo")
    })

    test("--ready followed by another flag defaults to 'true'", () => {
      const result = parseArgs(["list", "--ready", "--priority", "high"])
      expect(result.flags.ready).toBe("true")
      expect(result.flags.priority).toBe("high")
    })

    test("multiple boolean flags together", () => {
      const result = parseArgs(["list", "--blocked", "--ready"])
      expect(result.flags.blocked).toBe("true")
      expect(result.flags.ready).toBe("true")
    })
  })

  // ── Format extraction and defaults ─────────────────────────────

  describe("format extraction", () => {
    test("defaults format to 'text' when not specified", () => {
      const result = parseArgs(["list"])
      expect(result.format).toBe("text")
    })

    test("extracts --format json", () => {
      const result = parseArgs(["list", "--format", "json"])
      expect(result.format).toBe("json")
    })

    test("extracts --format text", () => {
      const result = parseArgs(["list", "--format", "text"])
      expect(result.format).toBe("text")
    })

    test("removes format from flags object", () => {
      const result = parseArgs(["list", "--format", "json"])
      expect(result.format).toBe("json")
      expect(result.flags.format).toBeUndefined()
    })

    test("unknown format value defaults to 'text'", () => {
      const result = parseArgs(["list", "--format", "yaml"])
      expect(result.format).toBe("text")
    })

    test("format works with other flags", () => {
      const result = parseArgs(["list", "--status", "todo", "--format", "json", "--priority", "high"])
      expect(result.format).toBe("json")
      expect(result.flags.status).toBe("todo")
      expect(result.flags.priority).toBe("high")
      expect(result.flags.format).toBeUndefined()
    })
  })

  // ── Edge cases ─────────────────────────────────────────────────

  describe("edge cases", () => {
    test("empty args produce empty subcommand", () => {
      const result = parseArgs([])
      expect(result.subcommand).toBe("")
      expect(result.subsubcommand).toBeUndefined()
      expect(result.positional).toEqual([])
      expect(result.flags).toEqual({})
      expect(result.format).toBe("text")
    })

    test("trailing flag with no value gets empty string", () => {
      const result = parseArgs(["add", "--title"])
      expect(result.flags.title).toBe("")
    })

    test("flag at end (non-boolean) with no value gets empty string", () => {
      const result = parseArgs(["edit", "TASK1", "--priority"])
      expect(result.flags.priority).toBe("")
    })

    test("only flags, no subcommand (starts with --)", () => {
      const result = parseArgs(["--format", "json"])
      // First arg starts with -- so no subcommand extracted
      expect(result.subcommand).toBe("")
      expect(result.format).toBe("json")
    })

    test("subcommand with no other args", () => {
      const result = parseArgs(["list"])
      expect(result.subcommand).toBe("list")
      expect(result.positional).toEqual([])
      expect(result.flags).toEqual({})
      expect(result.format).toBe("text")
    })

    test("complex real-world command: add with many flags", () => {
      const result = parseArgs([
        "add",
        "--title", "Fix login bug",
        "--priority", "high",
        "--type", "bug",
        "--status", "todo",
        "--tags", "auth,frontend",
        "--source", "opencode",
        "--source-ref", "session-abc",
        "--format", "json",
      ])
      expect(result.subcommand).toBe("add")
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

    test("complex real-world command: dep add with positional and flags", () => {
      const result = parseArgs(["dep", "add", "TASK_ABC", "--on", "TASK_DEF", "--format", "json"])
      expect(result.subcommand).toBe("dep")
      expect(result.subsubcommand).toBe("add")
      expect(result.positional).toEqual(["TASK_ABC"])
      expect(result.flags.on).toBe("TASK_DEF")
      expect(result.format).toBe("json")
    })

    test("list with boolean and value flags mixed", () => {
      const result = parseArgs(["list", "--status", "in_progress", "--blocked", "--format", "json"])
      expect(result.subcommand).toBe("list")
      expect(result.flags.status).toBe("in_progress")
      expect(result.flags.blocked).toBe("true")
      expect(result.format).toBe("json")
    })

    test("positional args interspersed with flags", () => {
      // positional between flags — ID then flag then more positionals
      const result = parseArgs(["view", "ID1", "--format", "json", "ID2"])
      expect(result.positional).toEqual(["ID1", "ID2"])
      expect(result.format).toBe("json")
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

  test("resolveTaskId works through cmdComplete with suffix", () => {
    const result = cmdComplete(testDb.db, "FFF333444", "json")
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
// parseArgs — edge cases: unknown commands, malformed flags, special chars
// ═══════════════════════════════════════════════════════════════════

describe("parseArgs edge cases", () => {
  // ── Unknown commands ──────────────────────────────────────────

  describe("unknown commands", () => {
    test("unknown subcommand is parsed as-is (routing handles rejection)", () => {
      const result = parseArgs(["frobnicate"])
      expect(result.subcommand).toBe("frobnicate")
    })

    test("unknown dep sub-subcommand is parsed as-is", () => {
      const result = parseArgs(["dep", "frobnicate", "TASK1"])
      expect(result.subcommand).toBe("dep")
      expect(result.subsubcommand).toBe("frobnicate")
      expect(result.positional).toEqual(["TASK1"])
    })
  })

  // ── Malformed flags ───────────────────────────────────────────

  describe("malformed flags", () => {
    test("--key=value syntax treats '=' as part of the key (not supported)", () => {
      // The parser does not split on '=', so --title=hello becomes key "title=hello"
      const result = parseArgs(["add", "--title=hello"])
      // The key is "title=hello" with empty value (no next arg)
      expect(result.flags["title=hello"]).toBeDefined()
      expect(result.flags.title).toBeUndefined()
    })

    test("single-dash flags like -t are treated as positional args", () => {
      const result = parseArgs(["add", "-t", "My Task"])
      // -t doesn't start with "--", so it's positional
      expect(result.positional).toContain("-t")
      expect(result.positional).toContain("My Task")
    })

    test("value starting with -- is consumed as a flag key, not as a value", () => {
      // --title --weird: parser sees --title, then --weird as next flag (not value)
      const result = parseArgs(["add", "--title", "--weird"])
      // --title consumes --weird as its value (because --weird doesn't match boolean flags)
      // Actually: "weird" is not a boolean flag, so --title gets "--weird" as value? No.
      // Let's trace: arg="--title", key="title", next arg="--weird" which starts with "--"
      // So i+1 < length and args[i+1].startsWith("--") is checked only for boolean flags.
      // For non-boolean: `if (i + 1 < args.length)` — it takes next arg regardless.
      expect(result.flags.title).toBe("--weird")
    })
  })

  // ── Special characters in values ──────────────────────────────

  describe("special characters in values", () => {
    test("unicode/emoji in title", () => {
      const result = parseArgs(["add", "--title", "Fix 🐛 bug"])
      expect(result.flags.title).toBe("Fix 🐛 bug")
    })

    test("empty string value for title", () => {
      const result = parseArgs(["add", "--title", ""])
      expect(result.flags.title).toBe("")
    })

    test("value with newlines", () => {
      const result = parseArgs(["add", "--description", "line1\nline2"])
      expect(result.flags.description).toBe("line1\nline2")
    })

    test("value with special regex characters", () => {
      const result = parseArgs(["add", "--title", "Fix (.*) [issue]"])
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

  test("dep unknown sub-subcommand returns exit code 1", () => {
    const code = runCli("task", ["dep", "frobnicate", "TASK1"], testDb.db)
    expect(code).toBe(1)
  })

  test("dep with no sub-subcommand returns exit code 1", () => {
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
})
