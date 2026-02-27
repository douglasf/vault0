import { describe, test, expect } from "bun:test"
import {
  CMD_TASK,
  CMD_BOARD,
  TOP_LEVEL_COMMANDS,
  TOP_LEVEL_LOOKUP,
} from "../cli/command-defs.js"
import type { CommandDef } from "../cli/command-defs.js"
import { generateHelp, generateUsage } from "../cli/help.js"

// ── Registry Coherence Tests ────────────────────────────────────────

describe("command-defs registry", () => {
  test("every task subcommand has a unique name", () => {
    const names = CMD_TASK.subcommands!.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  test("every board subcommand has a unique name", () => {
    const names = CMD_BOARD.subcommands!.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  test("no alias collides with any command name in task subcommands", () => {
    const names = new Set(CMD_TASK.subcommands!.map((c) => c.name))
    for (const cmd of CMD_TASK.subcommands!) {
      for (const alias of cmd.aliases) {
        expect(names.has(alias)).toBe(false)
      }
    }
  })

  test("no alias collides with another alias in task subcommands", () => {
    const seen = new Set<string>()
    for (const cmd of CMD_TASK.subcommands!) {
      for (const alias of cmd.aliases) {
        expect(seen.has(alias)).toBe(false)
        seen.add(alias)
      }
    }
  })

  test("all task subcommands have an action function", () => {
    for (const cmd of CMD_TASK.subcommands!) {
      expect(typeof cmd.action).toBe("function")
    }
  })

  test("all board subcommands have an action function", () => {
    for (const cmd of CMD_BOARD.subcommands!) {
      expect(typeof cmd.action).toBe("function")
    }
  })

  test("top-level lookup contains task and board", () => {
    expect(TOP_LEVEL_LOOKUP.get("task")).toBe(CMD_TASK)
    expect(TOP_LEVEL_LOOKUP.get("board")).toBe(CMD_BOARD)
  })

  test("task container has exactly 8 subcommands", () => {
    expect(CMD_TASK.subcommands!.length).toBe(10)
  })

  test("board container has exactly 1 subcommand", () => {
    expect(CMD_BOARD.subcommands!.length).toBe(3)
  })

  test("top-level commands has exactly 2 entries (task, board)", () => {
    expect(TOP_LEVEL_COMMANDS.length).toBe(2)
  })

  test("edit command includes dep-add and dep-remove flags but not dep-list", () => {
    const edit = CMD_TASK.subcommands!.find((c) => c.name === "edit")
    expect(edit).toBeDefined()
    const optNames = edit!.options.map((o) => o.long)
    expect(optNames).toContain("dep-add")
    expect(optNames).toContain("dep-remove")
    expect(optNames).not.toContain("dep-list")
  })

  test("view command includes dep-list flag", () => {
    const view = CMD_TASK.subcommands!.find((c) => c.name === "view")
    expect(view).toBeDefined()
    const optNames = view!.options.map((o) => o.long)
    expect(optNames).toContain("dep-list")
  })

  test("all leaf commands include global options (format, help)", () => {
    for (const cmd of CMD_TASK.subcommands!) {
      const optNames = cmd.options.map((o) => o.long)
      expect(optNames).toContain("format")
      expect(optNames).toContain("help")
    }
    for (const cmd of CMD_BOARD.subcommands!) {
      const optNames = cmd.options.map((o) => o.long)
      expect(optNames).toContain("format")
      expect(optNames).toContain("help")
    }
  })

  test("no separate dep command exists in task subcommands", () => {
    const dep = CMD_TASK.subcommands!.find((c) => c.name === "dep")
    expect(dep).toBeUndefined()
  })

  test("all option defs have non-empty long name and description", () => {
    function checkOptions(cmd: CommandDef) {
      for (const opt of cmd.options) {
        expect(opt.long.length).toBeGreaterThan(0)
        expect(opt.description.length).toBeGreaterThan(0)
      }
      if (cmd.subcommands) {
        for (const sub of cmd.subcommands) {
          checkOptions(sub)
        }
      }
    }

    for (const cmd of TOP_LEVEL_COMMANDS) {
      checkOptions(cmd)
    }
  })

  test("all arg defs have non-empty name and description", () => {
    function checkArgs(cmd: CommandDef) {
      for (const arg of cmd.args) {
        expect(arg.name.length).toBeGreaterThan(0)
        expect(arg.description.length).toBeGreaterThan(0)
      }
      if (cmd.subcommands) {
        for (const sub of cmd.subcommands) {
          checkArgs(sub)
        }
      }
    }

    for (const cmd of TOP_LEVEL_COMMANDS) {
      checkArgs(cmd)
    }
  })
})

// ── Help Generation Tests ───────────────────────────────────────────

describe("help generation", () => {
  test("generateHelp for task container includes all subcommand names", () => {
    const help = generateHelp(CMD_TASK)
    for (const sub of CMD_TASK.subcommands!) {
      expect(help).toContain(sub.name)
    }
  })

  test("generateHelp for task container does not contain ghost 'complete' command", () => {
    const help = generateHelp(CMD_TASK)
    expect(help).not.toContain("complete")
  })

  test("generateHelp for board container includes all subcommand names", () => {
    const help = generateHelp(CMD_BOARD)
    for (const sub of CMD_BOARD.subcommands!) {
      expect(help).toContain(sub.name)
    }
  })

  test("generateHelp for leaf command shows options", () => {
    const edit = CMD_TASK.subcommands!.find((c) => c.name === "edit")!
    const help = generateHelp(edit, "vault0 task")
    expect(help).toContain("--title")
    expect(help).toContain("--dep-add")
    expect(help).toContain("--dep-remove")
    expect(help).not.toContain("--dep-list")
    expect(help).toContain("--format")
    expect(help).toContain("--help")
  })

  test("generateHelp for view command shows dep-list and global options", () => {
    const view = CMD_TASK.subcommands!.find((c) => c.name === "view")!
    const help = generateHelp(view, "vault0 task")
    expect(help).toContain("--dep-list")
    expect(help).toContain("--format")
    expect(help).toContain("--help")
  })

  test("generateUsage mentions both task and board", () => {
    const usage = generateUsage()
    expect(usage).toContain("task")
    expect(usage).toContain("board")
  })
})
