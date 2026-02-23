// ── Exit Screen ────────────────────────────────────────────────────
// Renders a goodbye banner with session stats to normal stdout.
// Called AFTER leaving the alternate screen buffer so it persists
// in the terminal like OpenCode's exit screen.

import { getSessionStats } from "./session-stats.js"
import { LOGO_LINES } from "./logo.js"
import { theme } from "./theme.js"

// ── ANSI helpers ────────────────────────────────────────────────────

const ESC = "\x1b["
const RESET = `${ESC}0m`
const BOLD = `${ESC}1m`

/** Convert a hex color string (#RRGGBB) to an ANSI 24-bit fg color escape */
function hexToAnsi(hex: string): string {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return `${ESC}38;2;${r};${g};${b}m`
}

// ── ASCII Art Banner ────────────────────────────────────────────────

function renderBanner(): string {
  const FG = hexToAnsi(theme.fg_1)
  return `${FG}\n${LOGO_LINES.join("\n")}\n${RESET}`
}

// ── Main render function ────────────────────────────────────────────

export function renderExitScreen(): void {
  const stats = getSessionStats()
  const CYAN = hexToAnsi(theme.cyan)
  const GREEN = hexToAnsi(theme.green)
  const FG = hexToAnsi(theme.fg_1)

  let output = renderBanner()

  // Minimal stats — only created and done
  if (stats.tasksCreated > 0 || stats.tasksDone > 0) {
    output += "\n"
    if (stats.tasksCreated > 0) {
      output += `   ${CYAN}+${RESET}  ${FG}Tasks created${RESET}  ${BOLD}${CYAN}${stats.tasksCreated}${RESET}\n`
    }
    if (stats.tasksDone > 0) {
      output += `   ${GREEN}✦${RESET}  ${FG}Tasks done${RESET}     ${BOLD}${GREEN}${stats.tasksDone}${RESET}\n`
    }
  }

  output += "\n"
  process.stdout.write(output)
}
