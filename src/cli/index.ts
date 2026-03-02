import type { Vault0Database } from "../db/connection.js"
import type { Vault0Config } from "../lib/config.js"
import type { OutputFormat } from "./format.js"
import type { CommandDef } from "./command-defs.js"
import { errorMessage } from "../lib/format.js"
import { TOP_LEVEL_LOOKUP } from "./command-defs.js"
import { generateHelp, generateUsage } from "./help.js"
import { cmdIntegrationGet } from "./integration.js"
import { cmdConfigureOpencode } from "./configure-opencode.js"

// ── Argument Parser ─────────────────────────────────────────────────

/** Flags that accept multiple values (repeated --flag val1 --flag val2 → "val1,val2") */
const MULTI_VALUE_FLAGS = new Set(["task-id"])

/** Boolean flags that don't consume a following value */
const BOOLEAN_FLAGS = new Set(["blocked", "ready", "all", "help", "dep-list", "include-subtasks", "dry-run", "defaults"])

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
 *
 * Multi-value flags (e.g. --task-id) can be repeated; values are joined with commas.
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
      // Support --flag=value syntax
      const eqIdx = arg.indexOf("=")
      let key: string
      let inlineValue: string | undefined

      if (eqIdx !== -1) {
        key = arg.slice(2, eqIdx)
        inlineValue = arg.slice(eqIdx + 1)
      } else {
        key = arg.slice(2)
      }

      if (inlineValue !== undefined) {
        if (MULTI_VALUE_FLAGS.has(key) && flags[key]) {
          flags[key] = `${flags[key]},${inlineValue}`
        } else {
          flags[key] = inlineValue
        }
      } else if (BOOLEAN_FLAGS.has(key)) {
        // Check if next arg is a value or another flag
        if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
          flags[key] = args[++i]
        } else {
          flags[key] = "true"
        }
      } else if (i + 1 < args.length) {
        const value = args[++i]
        if (MULTI_VALUE_FLAGS.has(key) && flags[key]) {
          flags[key] = `${flags[key]},${value}`
        } else {
          flags[key] = value
        }
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
/** Optional context passed from the main entry point */
export interface CliContext {
  repoRoot: string
  config: Vault0Config
}

export function runCli(entity: string, args: string[], db: Vault0Database, context?: CliContext): number {
  try {
    // Handle "integration" command separately — it doesn't need DB access
    if (entity === "integration") {
      return handleIntegration(args, context)
    }

    // Handle "configure" command separately — it doesn't need DB access
    if (entity === "configure") {
      return handleConfigure(args)
    }

    // Look up the top-level container command
    const container = TOP_LEVEL_LOOKUP.get(entity)

    if (!container) {
      console.error(`Unknown command: "${entity}". Use "vault0 task ...", "vault0 board ...", "vault0 integration ...", or "vault0 configure ...".`)
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

function handleIntegration(args: string[], context?: CliContext): number {
  if (!context) {
    console.error("Error: integration command requires config context")
    return 1
  }

  const subcommand = args[0]
  if (subcommand !== "get") {
    console.error(`Unknown integration command: "${subcommand || ""}". Usage: vault0 integration get --integration=<name> [--agent=<name>]`)
    return 1
  }

  const parsed = parseArgs(args.slice(1))
  const result = cmdIntegrationGet(context.config, parsed.flags)
  console.log(result.output)
  return result.exitCode
}

function handleConfigure(args: string[]): number {
  const subcommand = args[0]
  if (subcommand !== "opencode") {
    console.error(`Unknown configure target: "${subcommand || ""}". Usage: vault0 configure opencode [--dry-run] [--defaults]`)
    return 1
  }

  const parsed = parseArgs(args.slice(1))

  // cmdConfigureOpencode is async (uses readline), so we need to handle the promise
  // In CLI mode, index.tsx calls process.exit after runCli, but since this is async
  // we return 0 and let the async function handle exit
  cmdConfigureOpencode(parsed.flags).then(exitCode => {
    process.exit(exitCode)
  }).catch(error => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Error: ${message}`)
    process.exit(1)
  })

  // Return value won't actually be used since we process.exit above
  return 0
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
