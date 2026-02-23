// ── Exit Screen ────────────────────────────────────────────────────
// Renders a goodbye banner with session stats to normal stdout.
// Called AFTER leaving the alternate screen buffer so it persists
// in the terminal like OpenCode's exit screen.

import { getSessionStats } from "./session-stats.js"
import { LOGO_LINES } from "./logo.js"

// ── ANSI helpers ────────────────────────────────────────────────────

const ESC = "\x1b["
const RESET = `${ESC}0m`
const BOLD = `${ESC}1m`
const DIM = `${ESC}2m`

// Selenized Dark palette
const CYAN = `${ESC}38;2;57;199;185m`
const GREEN = `${ESC}38;2;128;184;60m`
const DIM_FG = `${ESC}38;2;113;139;144m`
const FG = `${ESC}38;2;200;215;216m`

// ── ASCII Art Banner ────────────────────────────────────────────────

const BANNER = `${FG}\n${LOGO_LINES.join("\n")}\n${RESET}`

// ── Main render function ────────────────────────────────────────────

export function renderExitScreen(): void {
  const stats = getSessionStats()

  let output = BANNER

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
