// ── Theme Definition ────────────────────────────────────────────────
// Selenized palette structure:
//   bg_0, bg_1, bg_2: background shades (darkest to lightest for dark themes)
//   dim_0:            dim/muted content
//   fg_0, fg_1:       foreground shades (secondary, primary)
//   red, orange, yellow, green, cyan, blue, violet, magenta: accent colors

import { RGBA } from "@opentui/core"

export interface ThemeDefinition {
  /** Human-readable theme name */
  name: string
  /** Base theme to extend from (e.g. "solarized-dark") — loads that theme file and merges overrides */
  extends?: string

  // ── Background & foreground shades ────────────────────────────────
  bg_0: string    // Default background
  bg_1: string    // Lighter background (status bar, panels)
  bg_2: string    // Selection background / muted text
  dim_0: string   // Comments / dim content
  fg_0: string    // Secondary foreground
  fg_1: string    // Primary foreground

  // ── Accent colors ────────────────────────────────────────────────
  red: string     // Danger, critical, bugs, cancelled, blocked
  orange: string  // (available for future use)
  yellow: string  // Warning, high priority, in-progress
  green: string   // Success, done, features, ready
  cyan: string    // Accent, analysis, forms
  blue: string    // Info, todo
  violet: string  // In-review
  magenta: string // (available for future use)
}

// Palette key type for iteration
type PaletteKey = "bg_0" | "bg_1" | "bg_2" | "dim_0" | "fg_0" | "fg_1" | "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "violet" | "magenta"

const PALETTE_KEYS: PaletteKey[] = [
  "bg_0", "bg_1", "bg_2", "dim_0", "fg_0", "fg_1",
  "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta",
]

// ── Built-in Theme Defaults ─────────────────────────────────────────
// These are the code-level defaults. The app works standalone without
// any external theme files. Filesystem theme files (installed or user-
// created) are loaded first and deep-merged onto these defaults.

const SELENIZED_DARK_THEME: ThemeDefinition = {
  name: "Selenized Dark",
  bg_0: "#053d48",
  bg_1: "#0e4956",
  bg_2: "#275b69",
  dim_0: "#718b90",
  fg_0: "#adbcbc",
  fg_1: "#c8d7d8",
  red: "#fd564e",
  orange: "#f38649",
  yellow: "#e3b230",
  green: "#80b83c",
  cyan: "#39c7b9",
  blue: "#0096f5",
  violet: "#a58cec",
  magenta: "#f176bd",
}

const SELENIZED_LIGHT_THEME: ThemeDefinition = {
  name: "Selenized Light",
  bg_0: "#fef3da",
  bg_1: "#f0e4cc",
  bg_2: "#d6cbb4",
  dim_0: "#8f9894",
  fg_0: "#52666d",
  fg_1: "#384c52",
  red: "#d4212b",
  orange: "#c75d20",
  yellow: "#b38800",
  green: "#539100",
  cyan: "#009c8f",
  blue: "#0073d2",
  violet: "#7d64c5",
  magenta: "#cb4c99",
}

/** Built-in themes keyed by slug. These are the code-level defaults. */
const BUILTIN_THEMES: Record<string, ThemeDefinition> = {
  "selenized-dark": SELENIZED_DARK_THEME,
  "selenized-light": SELENIZED_LIGHT_THEME,
}

const DEFAULT_THEME_NAME = "selenized-dark"

// ── Active Theme (mutable module state) ─────────────────────────────

let activeTheme: ThemeDefinition = SELENIZED_DARK_THEME

/**
 * The current active theme. All components should read colors from this object.
 * Call `initTheme()` at startup to load the configured theme.
 */
export const theme: ThemeDefinition = new Proxy({} as ThemeDefinition, {
  get(_target, prop, receiver) {
    return Reflect.get(activeTheme, prop, receiver)
  },
  set(_target, prop, value, receiver) {
    return Reflect.set(activeTheme, prop, value, receiver)
  },
})

// ── Theme Loading ───────────────────────────────────────────────────

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

/** Directory for theme files: ~/.config/vault0/themes/ */
export function getThemesDir(): string {
  return join(homedir(), ".config", "vault0", "themes")
}

/**
 * Deep-merge a partial theme override into a base theme.
 * Only known keys are merged — unknown keys are ignored.
 */
function deepMergeTheme(base: ThemeDefinition, override: Partial<ThemeDefinition>): ThemeDefinition {
  const result = { ...base }

  if (override.name) result.name = override.name

  // Merge all palette keys
  for (const key of PALETTE_KEYS) {
    const val = override[key]
    if (val) result[key] = val
  }

  return result
}

/**
 * Load a theme file from the themes directory.
 * Returns the raw parsed JSON (partial), or null if the file doesn't exist.
 */
function loadThemeFile(name: string): Partial<ThemeDefinition> | null {
  const themesDir = getThemesDir()
  const filePath = join(themesDir, `${name}.json`)

  try {
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, "utf-8").trim()
    if (!raw) return null
    return JSON.parse(raw) as Partial<ThemeDefinition>
  } catch {
    return null
  }
}

/**
 * Resolve a theme by name.
 *
 * Loading strategy:
 * 1. Check filesystem (~/.config/vault0/themes/<name>.json)
 * 2. If found, deep-merge the file contents onto the built-in base theme
 *    - If the file specifies `extends`, that named theme is resolved first as the base
 *    - Otherwise the built-in theme with the same name is used as base (if it exists)
 *    - If no built-in exists for this name, selenized-dark is the base
 * 3. If no file found, use the built-in theme directly (if it exists)
 * 4. Final fallback: selenized-dark built-in
 */
function resolveTheme(name: string, visited = new Set<string>()): ThemeDefinition {
  if (visited.has(name)) {
    throw new Error(
      `Circular theme extends detected: ${[...visited].join(" -> ")} -> ${name}`,
    )
  }
  visited.add(name)

  const fileData = loadThemeFile(name)

  if (fileData) {
    // Determine the base theme to merge onto
    let base: ThemeDefinition
    if (fileData.extends) {
      // Recursively resolve the extended theme
      base = resolveTheme(fileData.extends, visited)
    } else if (BUILTIN_THEMES[name]) {
      base = BUILTIN_THEMES[name]
    } else {
      base = SELENIZED_DARK_THEME
    }
    return deepMergeTheme(base, fileData)
  }

  // No file — use built-in if available
  if (BUILTIN_THEMES[name]) return BUILTIN_THEMES[name]

  // Unknown theme name with no file — fall back to default
  if (name !== DEFAULT_THEME_NAME) {
    return resolveTheme(DEFAULT_THEME_NAME, visited)
  }

  return SELENIZED_DARK_THEME
}

/**
 * Initialize the theme system. Call once at startup after loading config.
 *
 * @param themeName - Theme name from config (e.g. "selenized-dark", "solarized-light", or a custom theme file name)
 */
export function initTheme(themeName?: string): void {
  activeTheme = resolveTheme(themeName || DEFAULT_THEME_NAME)
}

/**
 * List available themes — combines built-in themes with any filesystem themes.
 * Filesystem themes that share a name with a built-in are listed as "file" source.
 */
export function listThemes(): { name: string; source: "builtin" | "file" }[] {
  const themes = new Map<string, "builtin" | "file">()

  // Add built-in themes first
  for (const name of Object.keys(BUILTIN_THEMES)) {
    themes.set(name, "builtin")
  }

  // Overlay with filesystem themes
  const dir = getThemesDir()
  if (existsSync(dir)) {
    try {
      const files = readdirSync(dir)
      for (const file of files) {
        if (file.endsWith(".json")) {
          const name = file.replace(/\.json$/, "")
          themes.set(name, "file")
        }
      }
    } catch {
      // Silent — directory may not be readable
    }
  }

  return Array.from(themes.entries()).map(([name, source]) => ({ name, source }))
}

// ── Semantic Color Helpers ──────────────────────────────────────────
// These map domain concepts to palette entries so components don't
// need to know the palette mapping.

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case "critical": return activeTheme.red
    case "high":     return activeTheme.yellow
    case "normal":   return activeTheme.fg_0
    case "low":      return activeTheme.dim_0
    default:         return activeTheme.fg_0
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "backlog":     return activeTheme.dim_0
    case "todo":        return activeTheme.blue
    case "in_progress": return activeTheme.yellow
    case "in_review":   return activeTheme.violet
    case "done":        return activeTheme.green
    case "cancelled":   return activeTheme.red
    default:            return activeTheme.fg_0
  }
}

export function getTaskTypeColor(type: string): string {
  switch (type) {
    case "feature":  return activeTheme.green
    case "bug":      return activeTheme.red
    case "analysis": return activeTheme.cyan
    default:         return activeTheme.dim_0
  }
}

export function getStatusBgColor(): string {
  return activeTheme.bg_0
}

// ── OpenTUI RGBA Color Utilities ────────────────────────────────────
// These bridge the theme's hex string colors with OpenTUI's RGBA model.
// Theme colors remain hex strings (compatible with OpenTUI's fg/bg props).
// Use these utilities when you need RGBA objects (e.g. overlay dimming).

/** Convert a hex color string to an OpenTUI RGBA object */
export function toRGBA(hex: string, alpha = 255): RGBA {
  const rgba = RGBA.fromHex(hex)
  if (alpha !== 255) {
    rgba.a = alpha / 255
  }
  return rgba
}

/** Create a semi-transparent black background for modal overlay dimming */
export function overlayBg(alpha = 150): RGBA {
  return RGBA.fromInts(0, 0, 0, alpha)
}
