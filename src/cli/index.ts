import type { Vault0Database } from "../db/connection.js"
import type { OutputFormat } from "./format.js"
import type { CommandDef } from "./command-defs.js"
import { errorMessage } from "../lib/format.js"
import { TOP_LEVEL_LOOKUP } from "./command-defs.js"
import { generateHelp, generateUsage } from "./help.js"

// ── Argument Parser ─────────────────────────────────────────────────

interface ParsedArgs {
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
  let format: OutputFormat = "text"

  let i = 0

  // Parse all args
  while (i < args.length) {
    const arg = args[i]

    if (arg.startsWith("--")) {
      const key = arg.slice(2)

      // Boolean flags (no value following)
      if (key === "blocked" || key === "ready" || key === "all" || key === "help" || key === "dep-list") {
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

  return { positional, flags: commandFlags, format }
}

// ── Subcommand Lookup ───────────────────────────────────────────────

/** Build a lookup map for a container's subcommands (name + aliases → CommandDef) */
function buildSubcommandLookup(container: CommandDef): Map<string, CommandDef> {
  const map = new Map<string, CommandDef>()
  if (!container.subcommands) return map
  for (const sub of container.subcommands) {
    map.set(sub.name, sub)
    for (const alias of sub.aliases) {
      map.set(alias, sub)
    }
  }
  return map
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
    // Look up the top-level container command
    const container = TOP_LEVEL_LOOKUP.get(entity)

    if (!container) {
      console.error(`Unknown command: "${entity}". Use "vault0 task ..." or "vault0 board ...".`)
      console.log(generateUsage())
      return 1
    }

    return handleContainer(container, args, db)
  } catch (error) {
    const message = errorMessage(error)
    console.error(`Error: ${message}`)
    return 1
  }
}

function handleContainer(container: CommandDef, args: string[], db: Vault0Database): number {
  // First positional arg is the subcommand name
  const subName = args[0]

  // No subcommand or "help" → print container help
  if (!subName || subName === "help" || subName === "--help") {
    console.log(generateHelp(container))
    return (subName === "help" || subName === "--help") ? 0 : 1
  }

  // Look up subcommand
  const lookup = buildSubcommandLookup(container)
  const cmdDef = lookup.get(subName)

  if (!cmdDef) {
    console.error(`Unknown ${container.name} command: "${subName}"`)
    console.log(generateHelp(container))
    return 1
  }

  // Parse remaining args (everything after the subcommand name)
  const parsed = parseArgs(args.slice(1))

  // --help on a leaf command → show leaf help
  if (parsed.flags.help) {
    console.log(generateHelp(cmdDef, `vault0 ${container.name}`))
    return 0
  }

  if (!cmdDef.action) {
    console.error("Internal error: no action defined for command")
    return 1
  }

  const result = cmdDef.action(db, parsed.positional, parsed.flags, parsed.format)
  console.log(result.message)
  return result.success ? 0 : 1
}

// ── Usage (kept for backward compatibility with index.tsx import) ────

export function printUsage() {
  console.log(generateUsage())
}
