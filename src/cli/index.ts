import type { Vault0Database } from "../db/connection.js"
import type { OutputFormat } from "./format.js"
import {
  cmdAdd,
  cmdList,
  cmdView,
  cmdEdit,
  cmdMove,
  cmdComplete,
  cmdDelete,
  cmdArchiveDone,
  cmdDepAdd,
  cmdDepRemove,
  cmdDepList,
  cmdBoardList,
} from "./commands.js"

// ── Argument Parser ─────────────────────────────────────────────────

interface ParsedArgs {
  subcommand: string
  subsubcommand?: string
  positional: string[]
  flags: Record<string, string>
  format: OutputFormat
}

/**
 * Parse CLI arguments into structured form.
 *
 * Supports:
 *   vault0 task <subcommand> [positional...] [--flag value] [--format json]
 *   vault0 board <subcommand>
 */
export function parseArgs(args: string[]): ParsedArgs {
  const flags: Record<string, string> = {}
  const positional: string[] = []
  let subcommand = ""
  let subsubcommand: string | undefined
  let format: OutputFormat = "text"

  // First non-flag arg is the subcommand
  let i = 0

  // Get subcommand (add, list, view, edit, move, complete, delete, dep)
  if (i < args.length && !args[i].startsWith("--")) {
    subcommand = args[i]
    i++
  }

  // For 'dep' subcommand, get the sub-subcommand (add, rm, list)
  if (subcommand === "dep" && i < args.length && !args[i].startsWith("--")) {
    subsubcommand = args[i]
    i++
  }

  // Parse remaining args
  while (i < args.length) {
    const arg = args[i]

    if (arg.startsWith("--")) {
      const key = arg.slice(2)

      // Boolean flags (no value following)
      if (key === "blocked" || key === "ready" || key === "all") {
        // Check if next arg is a value or another flag
        if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
          flags[key] = args[++i]
        } else {
          flags[key] = "true"
        }
      } else if (i + 1 < args.length) {
        flags[key] = args[++i]
      } else {
        flags[key] = ""
      }
    } else {
      positional.push(arg)
    }

    i++
  }

  // Extract format
  if (flags.format) {
    format = flags.format === "json" ? "json" : "text"
  }

  // Remove format from flags so it's not passed to commands
  const { format: _fmt, ...commandFlags } = flags

  return { subcommand, subsubcommand, positional, flags: commandFlags, format }
}

// ── Router ──────────────────────────────────────────────────────────

/**
 * Route a parsed CLI invocation to the appropriate command handler.
 *
 * @param entity - "task" or "board"
 * @param args - Everything after `vault0 <entity>`
 * @param db - Database connection
 */
export function runCli(entity: string, args: string[], db: Vault0Database): number {
  try {
    if (entity === "board") {
      return handleBoard(args, db)
    }

    if (entity === "task") {
      return handleTask(args, db)
    }

    console.error(`Unknown command: "${entity}". Use "vault0 task ..." or "vault0 board ...".`)
    printUsage()
    return 1
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Error: ${message}`)
    return 1
  }
}

function handleTask(args: string[], db: Vault0Database): number {
  const parsed = parseArgs(args)

  if (!parsed.subcommand || parsed.subcommand === "help") {
    printTaskUsage()
    return parsed.subcommand === "help" ? 0 : 1
  }

  let result: ReturnType<typeof cmdAdd> | undefined

  switch (parsed.subcommand) {
    case "add":
      result = cmdAdd(db, parsed.flags, parsed.format)
      break

    case "list":
    case "ls":
      result = cmdList(db, parsed.flags, parsed.format)
      break

    case "view":
    case "show":
      result = cmdView(db, parsed.positional[0] || parsed.flags.id || "", parsed.format)
      break

    case "edit":
    case "update":
      result = cmdEdit(db, parsed.positional[0] || parsed.flags.id || "", parsed.flags, parsed.format)
      break

    case "move":
    case "mv":
      result = cmdMove(db, parsed.positional[0] || parsed.flags.id || "", parsed.flags, parsed.format)
      break

    case "complete":
    case "done":
      result = cmdComplete(db, parsed.positional[0] || parsed.flags.id || "", parsed.format)
      break

    case "delete":
    case "rm":
    case "archive":
      result = cmdDelete(db, parsed.positional[0] || parsed.flags.id || "", parsed.format)
      break

    case "archive-done":
      result = cmdArchiveDone(db, parsed.flags, parsed.format)
      break

    case "dep": {
      const sub = parsed.subsubcommand || ""
      const targetId = parsed.positional[0] || parsed.flags.id || ""

      switch (sub) {
        case "add":
          result = cmdDepAdd(db, targetId, parsed.flags, parsed.format)
          break
        case "rm":
        case "remove":
          result = cmdDepRemove(db, targetId, parsed.flags, parsed.format)
          break
        case "list":
        case "ls":
          result = cmdDepList(db, targetId, parsed.format)
          break
        default:
          console.error(`Unknown dep subcommand: "${sub}". Use: add, rm, list`)
          printDepUsage()
          return 1
      }
      break
    }

    default:
      console.error(`Unknown task command: "${parsed.subcommand}"`)
      printTaskUsage()
      return 1
  }

  if (!result) {
    console.error("Internal error: no result from command handler")
    return 1
  }

  console.log(result.message)
  return result.success ? 0 : 1
}

function handleBoard(args: string[], db: Vault0Database): number {
  const parsed = parseArgs(args)

  if (!parsed.subcommand || parsed.subcommand === "help") {
    printBoardUsage()
    return parsed.subcommand === "help" ? 0 : 1
  }

  switch (parsed.subcommand) {
    case "list":
    case "ls": {
      const result = cmdBoardList(db, parsed.format)
      console.log(result.message)
      return result.success ? 0 : 1
    }

    default:
      console.error(`Unknown board command: "${parsed.subcommand}"`)
      printBoardUsage()
      return 1
  }
}

// ── Usage ───────────────────────────────────────────────────────────

export function printUsage() {
  console.log(`
Vault0 CLI — Task Management Commands

Usage:
  vault0 task <command> [options]    Manage tasks
  vault0 board <command> [options]   Manage boards
  vault0                             Launch interactive TUI

Run "vault0 task help" or "vault0 board help" for command-specific help.
`)
}

function printTaskUsage() {
  console.log(`
Vault0 Task Commands

Usage:  vault0 task <command> [options]

Commands:
  add                           Create a new task
  list, ls                      List tasks (with optional filters)
  view, show    <ID>            View detailed task information
  edit, update  <ID>            Update task metadata
  move, mv      <ID>            Change task status
  complete, done <ID>           Mark task as done
  delete, rm    <ID>            Delete a task (archive first, hard-delete if already archived)
  archive-done                  Archive all tasks in Done lane
  dep add       <ID>            Add a dependency
  dep rm        <ID>            Remove a dependency
  dep list      <ID>            List dependencies

Global Options:
  --format json                 Output as JSON (default: text)
  --board <ID>                  Target a specific board (default: first board)

Add Options:
  --title <string>              Task title (required)
  --description <string>        Task description
  --priority <level>            critical | high | normal | low (default: normal)
  --status <status>             backlog | todo | in_progress | in_review | done | cancelled (default: backlog)
  --parent <ID>                 Parent task ID (for subtasks)
  --tags <t1,t2,...>            Comma-separated tags
  --source <source>             manual | todo_md | opencode | opencode-plan | import (default: manual)
  --source-ref <string>         Source reference (file path, URL, plan name, or import ID)

List Options:
  --status <status>             Filter by status
  --priority <level>            Filter by priority
  --search <string>             Search title and description
  --blocked                     Show only blocked tasks
  --ready                       Show only ready tasks

Edit Options:
  --title <string>              New title
  --description <string>        New description
  --priority <level>            New priority
  --tags <t1,t2,...>            New tags (replaces existing)

Move Options:
  --status <status>             Target status (required)

Dependency Options:
  --on <ID>                     Dependency target task ID (required for add/rm)

Examples:
  vault0 task add --title "Fix login bug" --priority high --status todo
  vault0 task add --title "Implement auth" --source opencode --source-ref "session-123"
  vault0 task add --title "Refactor DB layer" --source opencode-plan --source-ref my-plan
  vault0 task list --status in_progress
  vault0 task list --format json
  vault0 task view abc12345
  vault0 task edit abc12345 --priority critical
  vault0 task move abc12345 --status done
  vault0 task complete abc12345
  vault0 task delete abc12345
  vault0 task dep add abc12345 --on def67890
  vault0 task dep list abc12345

Note: Task IDs can be shortened — use the last 8+ characters.
`)
}

function printDepUsage() {
  console.log(`
Vault0 Dependency Commands

Usage:  vault0 task dep <command> <ID> [options]

Commands:
  add   <ID> --on <DEP_ID>     Add dependency (ID depends on DEP_ID)
  rm    <ID> --on <DEP_ID>     Remove dependency
  list  <ID>                   List all dependencies for a task
`)
}

function printBoardUsage() {
  console.log(`
Vault0 Board Commands

Usage:  vault0 board <command> [options]

Commands:
  list, ls                      List all boards

Options:
  --format json                 Output as JSON (default: text)
`)
}
