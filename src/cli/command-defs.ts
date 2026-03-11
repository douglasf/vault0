import { existsSync, lstatSync, readFileSync, readlinkSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import type { Vault0Database } from "../db/connection.js"
import type { CommandResult } from "./commands.js"
import type { OutputFormat } from "./format.js"
import type { Vault0Config } from "../lib/config.js"
import {
  cmdAdd,
  cmdList,
  cmdView,
  cmdEdit,
  cmdMove,
  cmdDelete,
  cmdUnarchive,
  cmdSubtasks,
  cmdTaskExport,
  cmdBoardList,
  cmdBoardExport,
  cmdBoardImport,
  cmdTaskImport,
} from "./commands.js"

// ── Types ───────────────────────────────────────────────────────────

export interface ArgDef {
  /** Argument name as displayed in usage (e.g. "ID") */
  name: string
  /** Whether this argument is required */
  required: boolean
  /** One-line description */
  description: string
}

export interface OptionDef {
  /** Long flag name without dashes (e.g. "title") */
  long: string
  /** Short flag alias (e.g. "t"), if any */
  short?: string
  /** One-line description */
  description: string
  /** Placeholder for the value (e.g. "<string>", "<status>") */
  valuePlaceholder?: string
  /** Valid values for enum-like flags */
  validValues?: string[]
  /** Default value display string */
  defaultValue?: string
  /** Whether this is a boolean flag (no value required) */
  boolean?: boolean
}

/** Optional context passed from the main entry point */
export interface CliContext {
  repoRoot: string
  config: Vault0Config
}

export type CommandAction = (
  db: Vault0Database,
  positional: string[],
  flags: Record<string, string>,
  format: OutputFormat,
  context?: CliContext,
) => CommandResult

export interface CommandDef {
  /** Primary command name */
  name: string
  /** Alternative names (e.g. ["ls"] for "list") */
  aliases: string[]
  /** One-line summary */
  description: string
  /** Positional arguments */
  args: ArgDef[]
  /** Flag options */
  options: OptionDef[]
  /** Nested subcommands (for container commands like "task", "board") */
  subcommands?: CommandDef[]
  /** Handler function — absent for container commands */
  action?: CommandAction
}

// ── Shared Options ──────────────────────────────────────────────────

const OPT_FORMAT: OptionDef = {
  long: "format",
  description: "Output format",
  valuePlaceholder: "<format>",
  validValues: ["text", "json"],
  defaultValue: "text",
}

const OPT_HELP: OptionDef = {
  long: "help",
  short: "h",
  description: "Show help for this command",
  boolean: true,
}

/** Global flags included in every leaf command's options */
export const GLOBAL_OPTIONS: OptionDef[] = [OPT_FORMAT, OPT_HELP]

const OPT_BOARD: OptionDef = {
  long: "board",
  description: "Target a specific board",
  valuePlaceholder: "<ID>",
  defaultValue: "first board",
}

// ── Task Subcommand Definitions ─────────────────────────────────────

export const CMD_ADD: CommandDef = {
  name: "add",
  aliases: [],
  description: "Create a new task",
  args: [],
  options: [
    { long: "title", description: "Task title (required)", valuePlaceholder: "<string>" },
    { long: "description", description: "Task description", valuePlaceholder: "<string>" },
    { long: "priority", description: "Priority level", valuePlaceholder: "<level>", validValues: ["critical", "high", "normal", "low"], defaultValue: "normal" },
    { long: "type", description: "Task type", valuePlaceholder: "<type>", validValues: ["feature", "bug", "analysis"] },
    { long: "status", description: "Initial status", valuePlaceholder: "<status>", validValues: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"], defaultValue: "backlog" },
    { long: "parent", description: "Parent task ID (for subtasks)", valuePlaceholder: "<ID>" },
    { long: "tags", description: "Comma-separated tags", valuePlaceholder: "<t1,t2,...>" },
    { long: "source", description: "Task source", valuePlaceholder: "<source>", validValues: ["manual", "todo_md", "opencode", "opencode-plan", "import"], defaultValue: "manual" },
    { long: "source-ref", description: "Source reference (file path, URL, plan name, or import ID)", valuePlaceholder: "<string>" },
    OPT_BOARD,
    ...GLOBAL_OPTIONS,
  ],
  action: (_db, _pos, flags, format, context) => cmdAdd(_db, flags, format, context),
}

export const CMD_LIST: CommandDef = {
  name: "list",
  aliases: ["ls"],
  description: "List tasks (with optional filters)",
  args: [],
  options: [
    { long: "status", description: "Filter by status", valuePlaceholder: "<status>", validValues: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"] },
    { long: "priority", description: "Filter by priority", valuePlaceholder: "<level>", validValues: ["critical", "high", "normal", "low"] },
    { long: "search", description: "Search title, description, solution, and tags (FTS5)", valuePlaceholder: "<string>" },
    { long: "blocked", description: "Show only blocked tasks", boolean: true },
    { long: "ready", description: "Show only ready tasks (unblocked, not in_review/done)", boolean: true },
    { long: "tag", description: "Filter by tag (tasks with ANY matching tag, comma-separated)", valuePlaceholder: "<tags>" },
    { long: "tags-any", description: "Alias for --tag (tasks with ANY matching tag, comma-separated)", valuePlaceholder: "<tags>" },
    { long: "tags-all", description: "Filter by tags (tasks with ALL matching tags, comma-separated)", valuePlaceholder: "<tags>" },
    OPT_BOARD,
    ...GLOBAL_OPTIONS,
  ],
  action: (_db, _pos, flags, format) => cmdList(_db, flags, format),
}

export const CMD_VIEW: CommandDef = {
  name: "view",
  aliases: ["show"],
  description: "View detailed task information",
  args: [{ name: "ID", required: true, description: "Task ID or suffix" }],
  options: [
    { long: "dep-list", description: "List all dependencies", boolean: true },
    ...GLOBAL_OPTIONS,
  ],
  action: (db, pos, flags, format) => cmdView(db, pos[0] || flags.id || "", format),
}

export const CMD_EDIT: CommandDef = {
  name: "edit",
  aliases: ["update"],
  description: "Update task metadata and dependencies",
  args: [{ name: "ID", required: true, description: "Task ID or suffix" }],
  options: [
    { long: "title", description: "New title", valuePlaceholder: "<string>" },
    { long: "description", description: "New description", valuePlaceholder: "<string>" },
    { long: "priority", description: "New priority", valuePlaceholder: "<level>", validValues: ["critical", "high", "normal", "low"] },
    { long: "type", description: "New type (or empty to clear)", valuePlaceholder: "<type>", validValues: ["feature", "bug", "analysis"] },
    { long: "tags", description: "New tags (replaces existing)", valuePlaceholder: "<t1,t2,...>" },
    { long: "solution", description: "Solution notes (or empty to clear)", valuePlaceholder: "<string>" },
    { long: "dep-add", description: "Add dependency on target task", valuePlaceholder: "<ID>" },
    { long: "dep-remove", description: "Remove dependency on target task", valuePlaceholder: "<ID>" },
    ...GLOBAL_OPTIONS,
  ],
  action: (db, pos, flags, format) => cmdEdit(db, pos[0] || flags.id || "", flags, format),
}

export const CMD_MOVE: CommandDef = {
  name: "move",
  aliases: ["mv"],
  description: "Change task status",
  args: [{ name: "ID", required: true, description: "Task ID or suffix" }],
  options: [
    { long: "status", description: "Target status (required)", valuePlaceholder: "<status>", validValues: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"] },
    { long: "solution", description: "Solution notes (set when moving to done)", valuePlaceholder: "<string>" },
    ...GLOBAL_OPTIONS,
  ],
  action: (db, pos, flags, format, context) => cmdMove(db, pos[0] || flags.id || "", flags, format, context),
}

export const CMD_DELETE: CommandDef = {
  name: "delete",
  aliases: ["rm", "archive"],
  description: "Delete a task (archive first, hard-delete if already archived)",
  args: [{ name: "ID", required: true, description: "Task ID or suffix" }],
  options: [...GLOBAL_OPTIONS],
  action: (db, pos, flags, format) => cmdDelete(db, pos[0] || flags.id || "", format),
}

export const CMD_UNARCHIVE: CommandDef = {
  name: "unarchive",
  aliases: ["restore"],
  description: "Restore a previously archived task",
  args: [{ name: "ID", required: true, description: "Task ID or suffix" }],
  options: [...GLOBAL_OPTIONS],
  action: (db, pos, flags, format) => cmdUnarchive(db, pos[0] || flags.id || "", format),
}

export const CMD_SUBTASKS: CommandDef = {
  name: "subtasks",
  aliases: ["subs"],
  description: "List subtasks for a task",
  args: [{ name: "ID", required: true, description: "Task ID or suffix" }],
  options: [
    { long: "ready", description: "Show only ready subtasks (unblocked, not in_review/done)", boolean: true },
    ...GLOBAL_OPTIONS,
  ],
  action: (db, pos, flags, format) => cmdSubtasks(db, pos[0] || flags.id || "", flags, format),
}

export const CMD_TASK_EXPORT: CommandDef = {
  name: "export",
  aliases: [],
  description: "Export tasks to JSON or Markdown",
  args: [],
  options: [
    { long: "task-id", description: "Task ID to export (repeatable)", valuePlaceholder: "<ID>" },
    { long: "include-subtasks", description: "Include subtasks nested under each task", boolean: true },
    { long: "export-format", description: "Export format", valuePlaceholder: "<format>", validValues: ["json", "markdown"], defaultValue: "json" },
    { long: "out", description: "Write output to file", valuePlaceholder: "<path>" },
    OPT_FORMAT,
    OPT_HELP,
  ],
  action: (_db, _pos, flags, _format) => cmdTaskExport(_db, flags, _format),
}

export const CMD_TASK_IMPORT: CommandDef = {
  name: "import",
  aliases: [],
  description: "Import tasks from a JSON file",
  args: [{ name: "FILE", required: true, description: "Path to JSON file to import" }],
  options: [
    OPT_BOARD,
    ...GLOBAL_OPTIONS,
  ],
  action: (db, pos, flags, format) => cmdTaskImport(db, pos[0] || "", flags, format),
}

// ── Board Subcommand Definitions ────────────────────────────────────

export const CMD_BOARD_LIST: CommandDef = {
  name: "list",
  aliases: ["ls"],
  description: "List all boards",
  args: [],
  options: [...GLOBAL_OPTIONS],
  action: (db, _pos, _flags, format) => cmdBoardList(db, format),
}

export const CMD_BOARD_EXPORT: CommandDef = {
  name: "export",
  aliases: [],
  description: "Export a board and all its tasks to JSON",
  args: [],
  options: [
    OPT_BOARD,
    { long: "out", description: "Write output to file", valuePlaceholder: "<path>" },
    ...GLOBAL_OPTIONS,
  ],
  action: (_db, _pos, flags, format) => cmdBoardExport(_db, flags, format),
}

export const CMD_BOARD_IMPORT: CommandDef = {
  name: "import",
  aliases: [],
  description: "Import a board from a JSON file",
  args: [{ name: "FILE", required: true, description: "Path to JSON file to import" }],
  options: [
    OPT_BOARD,
    ...GLOBAL_OPTIONS,
  ],
  action: (db, pos, flags, format) => cmdBoardImport(db, pos[0] || "", flags, format),
}

// ── Container Commands ──────────────────────────────────────────────

/** Top-level "task" container command with all task subcommands */
export const CMD_TASK: CommandDef = {
  name: "task",
  aliases: [],
  description: "Manage tasks",
  args: [],
  options: [],
  subcommands: [
    CMD_ADD,
    CMD_LIST,
    CMD_VIEW,
    CMD_EDIT,
    CMD_MOVE,
    CMD_DELETE,
    CMD_UNARCHIVE,
    CMD_SUBTASKS,
    CMD_TASK_EXPORT,
    CMD_TASK_IMPORT,
  ],
}

/** Top-level "board" container command with all board subcommands */
export const CMD_BOARD: CommandDef = {
  name: "board",
  aliases: [],
  description: "Manage boards",
  args: [],
  options: [],
  subcommands: [
    CMD_BOARD_LIST,
    CMD_BOARD_EXPORT,
    CMD_BOARD_IMPORT,
  ],
}

// ── MCP Subcommand Definitions ──────────────────────────────────────

export const CMD_MCP_SERVE: CommandDef = {
  name: "serve",
  aliases: [],
  description: "Start the MCP server (stdio transport)",
  args: [],
  options: [
    {
      long: "path",
      description: "Repository root directory",
      valuePlaceholder: "<DIR>",
    },
    ...GLOBAL_OPTIONS,
  ],
}

export const CMD_MCP_INIT: CommandDef = {
  name: "init",
  aliases: [],
  description: "Generate MCP config snippet for OpenCode integration",
  args: [],
  options: [
    { long: "write", short: "w", description: "Write config to .opencode/opencode.jsonc", boolean: true },
    { long: "path", short: "p", description: "Target file path (default: .opencode/opencode.jsonc in repo root)", valuePlaceholder: "<path>" },
    { long: "force", short: "f", description: "Overwrite existing file (don't merge)", boolean: true },
    ...GLOBAL_OPTIONS,
  ],
  action: (_db, _pos, flags, _format) => cmdMcpInit(flags),
}

// ── MCP Init Implementation ─────────────────────────────────────────

const MCP_SNIPPET = {
  mcp: {
    vault0: {
      type: "local",
      command: ["vault0", "mcp", "serve"],
      enabled: true,
    },
  },
}

/** Walk up from startDir looking for .git/ directory, return its parent as repo root */
function findRepoRoot(startDir: string = process.cwd()): string {
  let current = resolve(startDir)
  while (current !== "/") {
    if (existsSync(join(current, ".git"))) {
      return current
    }
    current = resolve(current, "..")
  }
  return process.cwd()
}

function cmdMcpInit(flags: Record<string, string>): CommandResult {
  const snippet = JSON.stringify(MCP_SNIPPET, null, 2)

  if (!flags.write) {
    return {
      success: true,
      message: `Add this to your .opencode/opencode.jsonc:\n\n${snippet}`,
    }
  }

  const targetFile = flags.path ? resolve(flags.path) : join(findRepoRoot(), ".opencode", "opencode.jsonc")
  const targetDir = dirname(targetFile)

  try {
    // Check if target is a symlink — refuse to write, show snippet instead
    if (existsSync(targetFile) && lstatSync(targetFile).isSymbolicLink()) {
      const linkTarget = readlinkSync(targetFile)
      return {
        success: true,
        message: `The target file is a symlink:\n  ${targetFile} → ${linkTarget}\n\nAdd this snippet to the linked file manually:\n\n${snippet}`,
      }
    }

    // Ensure .opencode/ directory exists
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
    }

    if (!existsSync(targetFile)) {
      writeFileSync(targetFile, `${snippet}\n`, "utf-8")
      return { success: true, message: `Created ${targetFile} with MCP server entry` }
    }

    // File exists
    if (flags.force) {
      writeFileSync(targetFile, `${snippet}\n`, "utf-8")
      return { success: true, message: `Overwrote ${targetFile} with MCP server entry` }
    }

    // Try to merge
    const existing = readFileSync(targetFile, "utf-8")
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(existing)
    } catch {
      return {
        success: false,
        message: `Failed to parse existing ${targetFile} (may contain JSONC comments). Use --force to overwrite.`,
      }
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        success: false,
        message: `Existing ${targetFile} is not a JSON object. Use --force to overwrite.`,
      }
    }

    // Merge mcp.vault0 entry
    const mcp = (parsed.mcp as Record<string, unknown>) ?? {}
    mcp.vault0 = MCP_SNIPPET.mcp.vault0
    parsed.mcp = mcp

    writeFileSync(targetFile, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8")
    return { success: true, message: `Updated ${targetFile} with MCP server entry` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, message: `Failed to write ${targetFile}: ${message}` }
  }
}

/** Top-level "mcp" container command */
export const CMD_MCP: CommandDef = {
  name: "mcp",
  aliases: [],
  description: "Manage MCP server integration",
  args: [],
  options: [],
  subcommands: [CMD_MCP_SERVE, CMD_MCP_INIT],
}

// ── Registries ──────────────────────────────────────────────────────

/** All top-level container commands */
export const TOP_LEVEL_COMMANDS: CommandDef[] = [CMD_TASK, CMD_BOARD, CMD_MCP]

// ── Lookup Helpers ──────────────────────────────────────────────────

/** Build a map from command name + aliases → CommandDef */
function buildLookup(commands: CommandDef[]): Map<string, CommandDef> {
  const map = new Map<string, CommandDef>()
  for (const cmd of commands) {
    map.set(cmd.name, cmd)
    for (const alias of cmd.aliases) {
      map.set(alias, cmd)
    }
  }
  return map
}

export const TOP_LEVEL_LOOKUP: Map<string, CommandDef> = buildLookup(TOP_LEVEL_COMMANDS)
