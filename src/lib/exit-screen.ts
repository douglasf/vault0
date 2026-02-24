// ── Exit Screen ────────────────────────────────────────────────────
// Renders a goodbye banner with session stats to normal stdout.
// Called AFTER leaving the alternate screen buffer so it persists
// in the terminal like OpenCode's exit screen.

import { fonts } from "@opentui/core"
import { getSessionStats } from "./session-stats.js"
import { theme } from "./theme.js"

// ── ANSI helpers ────────────────────────────────────────────────────

const ESC = "\x1b["
const RESET = `${ESC}0m`
const BOLD = `${ESC}1m`
const DIM = `${ESC}2m`

/** Convert a hex color string (#RRGGBB) to an ANSI 24-bit fg color escape */
function hexToAnsi(hex: string): string {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return `${ESC}38;2;${r};${g};${b}m`
}

// ── ASCII Font plain-text renderer ──────────────────────────────────
// Renders text using @opentui/core font data to plain strings (no renderer needed).

/** Strip color tags like <c1>...</c1> from font character data */
function stripColorTags(s: string): string {
  return s.replace(/<\/?c\d+>/g, "")
}

/** Render `text` using the "tiny" font to an array of plain-text lines */
function renderFontToLines(text: string): string[] {
  const fontDef = fonts.tiny
  const height = fontDef.lines
  const lines: string[] = Array.from({ length: height }, () => "")
  const letterspace = " ".repeat(fontDef.letterspace_size)

  for (let i = 0; i < text.length; i++) {
    const char = text[i].toUpperCase()
    const charDef = (fontDef.chars as Record<string, string[]>)[char]
    if (!charDef) {
      // Unknown char → use space
      const spaceDef = (fontDef.chars as Record<string, string[]>)[" "]
      if (spaceDef) {
        for (let row = 0; row < height; row++) {
          lines[row] += stripColorTags(spaceDef[row] ?? "")
        }
      } else {
        for (let row = 0; row < height; row++) {
          lines[row] += " "
        }
      }
    } else {
      for (let row = 0; row < height; row++) {
        lines[row] += stripColorTags(charDef[row] ?? "")
      }
    }
    // Add letter spacing between characters (not after the last one)
    if (i < text.length - 1) {
      for (let row = 0; row < height; row++) {
        lines[row] += letterspace
      }
    }
  }
  return lines
}

// ── ASCII Art Banner (tiny font) ────────────────────────────────────

function renderBanner(): string {
  const FG = hexToAnsi(theme.fg_1)
  const lines = renderFontToLines("vault0")
  let output = "\n"
  for (const line of lines) {
    output += `${FG}  ${line}${RESET}\n`
  }
  return output
}

// ── Main render function ────────────────────────────────────────────

export function renderExitScreen(): void {
  const stats = getSessionStats()
  const CYAN = hexToAnsi(theme.cyan)
  const GREEN = hexToAnsi(theme.green)
  const FG = hexToAnsi(theme.fg_1)

  let output = renderBanner()
  output += "  Thanks for playing!\n"

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
