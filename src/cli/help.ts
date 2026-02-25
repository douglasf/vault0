import type { CommandDef } from "./command-defs.js"
import { TOP_LEVEL_COMMANDS } from "./command-defs.js"

// ── Help Text Generation ────────────────────────────────────────────

/**
 * Format a single command's usage line for a command list.
 * Example: "  add                           Create a new task"
 */
function formatCommandLine(cmd: CommandDef, indent = 2): string {
  const prefix = " ".repeat(indent)
  const aliasStr = cmd.aliases.length > 0 ? `, ${cmd.aliases.join(", ")}` : ""
  const argStr = cmd.args.map((a) => a.required ? ` <${a.name}>` : ` [${a.name}]`).join("")
  const nameCol = `${cmd.name}${aliasStr}${argStr}`
  const padded = nameCol.padEnd(28)
  return `${prefix}${padded}${cmd.description}`
}

/**
 * Format an option line for help output.
 * Example: "  --title <string>              Task title (required)"
 */
function formatOptionLine(opt: { long: string; short?: string; description: string; valuePlaceholder?: string; validValues?: string[]; defaultValue?: string; boolean?: boolean }, indent = 2): string {
  const prefix = " ".repeat(indent)
  const flagPart = opt.boolean ? `--${opt.long}` : `--${opt.long}${opt.valuePlaceholder ? ` ${opt.valuePlaceholder}` : ""}`
  const padded = flagPart.padEnd(28)
  const defaultSuffix = opt.defaultValue ? ` (default: ${opt.defaultValue})` : ""
  const mainLine = `${prefix}${padded}${opt.description}${defaultSuffix}`
  if (opt.validValues && opt.validValues.length > 0) {
    const descStart = indent + 28
    const valuesLine = `${" ".repeat(descStart)}Values: ${opt.validValues.join(", ")}`
    return `${mainLine}\n${valuesLine}`
  }
  return mainLine
}

/**
 * Generate contextual help for any CommandDef.
 *
 * - **Container commands** (with subcommands): lists available subcommands with descriptions
 * - **Leaf commands** (with action): shows full usage with args and flags
 *
 * @param commandDef The command to generate help for
 * @param parentPath The command path prefix (e.g. "vault0 task")
 */
export function generateHelp(commandDef: CommandDef, parentPath = "vault0"): string {
  const lines: string[] = []
  const fullPath = `${parentPath} ${commandDef.name}`

  // Container command — list subcommands
  if (commandDef.subcommands && commandDef.subcommands.length > 0) {
    const label = commandDef.name.charAt(0).toUpperCase() + commandDef.name.slice(1)
    lines.push("")
    lines.push(`Vault0 ${label} Commands`)
    lines.push("")
    lines.push(`Usage:  ${fullPath} <command> [options]`)
    lines.push("")
    lines.push("Commands:")

    for (const sub of commandDef.subcommands) {
      lines.push(formatCommandLine(sub))
    }

    lines.push("")
    lines.push(`Run "${fullPath} <command> --help" for command-specific help.`)
    lines.push("")

    return lines.join("\n")
  }

  // Leaf command — show full usage with args and flags
  const argStr = commandDef.args.map((a) => a.required ? ` <${a.name}>` : ` [${a.name}]`).join("")
  const aliasStr = commandDef.aliases.length > 0 ? `  (aliases: ${commandDef.aliases.join(", ")})` : ""

  lines.push("")
  lines.push(`${commandDef.name} — ${commandDef.description}${aliasStr}`)
  lines.push("")
  lines.push(`Usage:  ${fullPath}${argStr} [options]`)

  if (commandDef.args.length > 0) {
    lines.push("")
    lines.push("Arguments:")
    for (const arg of commandDef.args) {
      const req = arg.required ? " (required)" : ""
      lines.push(`  ${arg.name.padEnd(28)}${arg.description}${req}`)
    }
  }

  if (commandDef.options.length > 0) {
    lines.push("")
    lines.push("Options:")
    for (const opt of commandDef.options) {
      lines.push(formatOptionLine(opt))
    }
  }

  lines.push("")

  return lines.join("\n")
}

/**
 * Generate top-level usage text.
 */
export function generateUsage(): string {
  const lines: string[] = []
  lines.push("")
  lines.push("Vault0 CLI — Task Management Commands")
  lines.push("")
  lines.push("Usage:")

  for (const cmd of TOP_LEVEL_COMMANDS) {
    lines.push(`  vault0 ${cmd.name} <command> [options]${" ".repeat(Math.max(0, 4 - cmd.name.length))}${cmd.description}`)
  }

  lines.push("  vault0                             Launch interactive TUI")
  lines.push("")
  lines.push(`Run "vault0 <command> help" for command-specific help.`)
  lines.push("")

  return lines.join("\n")
}
