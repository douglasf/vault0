// ── Theme Definition ────────────────────────────────────────────────
// Selenized palette structure:
//   bg_0, bg_1, bg_2: background shades (darkest to lightest for dark themes)
//   dim_0:            dim/muted content
//   fg_0, fg_1:       foreground shades (secondary, primary)
//   red, orange, yellow, green, cyan, blue, violet, magenta: accent colors

import { RGBA } from "@opentui/core"
import type { Appearance } from "./config.js"

export interface ThemeDefinition {
  /** Human-readable theme name */
  name: string
  /** Base theme to extend from (e.g. "solarized") — loads that theme and merges overrides */
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

/**
 * A theme family contains both dark and light palettes.
 * Theme files can provide one or both variants.
 */
export interface ThemeFamily {
  name: string
  extends?: string
  dark: ThemeDefinition
  light: ThemeDefinition
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

/** Built-in theme families keyed by family name. */
const BUILTIN_FAMILIES: Record<string, ThemeFamily> = {
  selenized: {
    name: "selenized",
    dark: SELENIZED_DARK_THEME,
    light: SELENIZED_LIGHT_THEME,
  },
}

/**
 * Legacy built-in themes keyed by old-style slug (e.g. "selenized-dark").
 * Supports backward compatibility with existing config files.
 */
const LEGACY_BUILTIN_THEMES: Record<string, ThemeDefinition> = {
  "selenized-dark": SELENIZED_DARK_THEME,
  "selenized-light": SELENIZED_LIGHT_THEME,
}

const DEFAULT_THEME_NAME = "selenized"
const DEFAULT_APPEARANCE: Appearance = "dark"

// ── Active Theme (mutable module state) ─────────────────────────────

let activeTheme: ThemeDefinition = SELENIZED_DARK_THEME
let activeFamily: ThemeFamily | null = null
let activeAppearance: Appearance = DEFAULT_APPEARANCE
let resolvedAppearance: "dark" | "light" = "dark"

/**
 * The current active theme. All components should read colors from this object.
 * Thanks to the Proxy, switching the active theme at runtime automatically
 * propagates to all consumers without any re-wiring.
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
 *
 * The base theme provides defaults for any palette keys missing from the
 * override, so the result is always a complete ThemeDefinition.
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
 * Validate that a ThemeDefinition has all required palette keys.
 * If any are missing, fills them from the fallback theme.
 * This prevents crashes when user-provided theme files omit required colors.
 */
function ensureCompleteTheme(theme: Partial<ThemeDefinition>, fallback: ThemeDefinition): ThemeDefinition {
  const result = { ...fallback, ...theme }
  result.name = theme.name || fallback.name

  for (const key of PALETTE_KEYS) {
    if (!result[key] || typeof result[key] !== "string") {
      result[key] = fallback[key]
    }
  }

  return result as ThemeDefinition
}

/**
 * Raw theme file format — supports both the new family format (with dark/light keys)
 * and the legacy flat format (single palette).
 */
interface ThemeFileData {
  name?: string
  extends?: string
  dark?: Partial<ThemeDefinition>
  light?: Partial<ThemeDefinition>
  // Legacy flat palette keys (when dark/light are absent)
  [key: string]: unknown
}

/**
 * Load a theme file from the themes directory.
 * Returns the raw parsed JSON, or null if the file doesn't exist.
 */
function loadThemeFile(name: string): ThemeFileData | null {
  const themesDir = getThemesDir()
  const filePath = join(themesDir, `${name}.json`)

  try {
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, "utf-8").trim()
    if (!raw) return null
    return JSON.parse(raw) as ThemeFileData
  } catch {
    return null
  }
}

/**
 * Check if a theme file uses the new family format (has dark and/or light keys).
 */
function isFamilyFormat(data: ThemeFileData): boolean {
  return data.dark !== undefined || data.light !== undefined
}

/**
 * Parse a legacy theme name like "selenized-dark" into { family, variant }.
 * Returns null if the name doesn't match the pattern.
 */
function parseLegacyName(name: string): { family: string; variant: "dark" | "light" } | null {
  if (name.endsWith("-dark")) return { family: name.slice(0, -5), variant: "dark" }
  if (name.endsWith("-light")) return { family: name.slice(0, -6), variant: "light" }
  return null
}

/**
 * Resolve a theme family by name, returning both dark and light variants.
 *
 * Theme files use the **family format**: a single JSON file (e.g. `gruvbox.json`)
 * containing `"dark"` and/or `"light"` keys, each with palette overrides.
 *
 * Expected file structure:
 * ```json
 * {
 *   "name": "my-theme",
 *   "extends": "selenized",          // optional — base family to inherit from
 *   "dark":  { "bg_0": "#...", ... },  // palette overrides for dark mode
 *   "light": { "bg_0": "#...", ... }   // palette overrides for light mode
 * }
 * ```
 *
 * If a variant key (`dark` or `light`) is missing from the file, the base
 * family's variant is used as a fallback. If both are missing, the file is
 * treated as a flat palette applied to both variants.
 *
 * Loading strategy:
 * 1. Try loading `<name>.json` as a family-format file
 * 2. Try built-in family
 * 3. Handle legacy flat-format file (no dark/light keys)
 * 4. Backward compat: parse legacy slug (e.g. "selenized-dark")
 * 5. Final fallback: selenized built-in
 */
function resolveFamily(name: string, visited = new Set<string>()): ThemeFamily {
  if (visited.has(name)) {
    throw new Error(
      `Circular theme extends detected: ${[...visited].join(" -> ")} -> ${name}`,
    )
  }
  visited.add(name)

  // 1. Try loading a family-format theme file
  const fileData = loadThemeFile(name)
  if (fileData && isFamilyFormat(fileData)) {
    // Determine base family
    let base: ThemeFamily
    if (fileData.extends) {
      base = resolveFamily(fileData.extends, visited)
    } else if (BUILTIN_FAMILIES[name]) {
      base = BUILTIN_FAMILIES[name]
    } else {
      base = BUILTIN_FAMILIES[DEFAULT_THEME_NAME]
    }
    return {
      name,
      dark: ensureCompleteTheme(
        fileData.dark ? deepMergeTheme(base.dark, fileData.dark) : base.dark,
        SELENIZED_DARK_THEME,
      ),
      light: ensureCompleteTheme(
        fileData.light ? deepMergeTheme(base.light, fileData.light) : base.light,
        SELENIZED_LIGHT_THEME,
      ),
    }
  }

  // 2. Try built-in family
  if (BUILTIN_FAMILIES[name]) return BUILTIN_FAMILIES[name]

  // 3. Handle legacy flat-format file (e.g. a single file with palette keys but no dark/light)
  if (fileData) {
    const base = BUILTIN_FAMILIES[DEFAULT_THEME_NAME]
    const partial = fileData as Partial<ThemeDefinition>
    // Apply as both dark and light (user can override one variant later)
    return {
      name,
      dark: ensureCompleteTheme(deepMergeTheme(base.dark, partial), SELENIZED_DARK_THEME),
      light: ensureCompleteTheme(deepMergeTheme(base.light, partial), SELENIZED_LIGHT_THEME),
    }
  }

  // 4. Backward compat: parse legacy slug like "selenized-dark"
  const legacy = parseLegacyName(name)
  if (legacy) {
    const family = resolveFamily(legacy.family, visited)
    // Return the family — the appearance will select the right variant
    return family
  }

  // 5. Final fallback
  if (name !== DEFAULT_THEME_NAME) {
    return resolveFamily(DEFAULT_THEME_NAME, visited)
  }

  return BUILTIN_FAMILIES[DEFAULT_THEME_NAME]
}

// ── OS Appearance Detection ─────────────────────────────────────────

/**
 * Detect the OS appearance (dark or light mode).
 *
 * Strategy (macOS-first, then cross-platform fallbacks):
 * 1. macOS: `defaults read -g AppleInterfaceStyle` — returns "Dark" in dark mode, errors in light mode
 * 2. COLORFGBG environment variable — common in terminal emulators
 * 3. Default to "dark" if detection fails
 */
export function detectOsAppearance(): "dark" | "light" {
  // macOS: check AppleInterfaceStyle
  try {
    const result = Bun.spawnSync(["defaults", "read", "-g", "AppleInterfaceStyle"])
    const output = result.stdout.toString().trim()
    if (output === "Dark") return "dark"
    // If the command succeeds but doesn't say "Dark", or if it fails (light mode),
    // the exit code is non-zero in light mode
    if (result.exitCode === 0) return "dark"
    return "light"
  } catch {
    // Not macOS or command failed
  }

  // COLORFGBG: "fg;bg" format, bg > 6 usually means light background
  const colorfgbg = process.env.COLORFGBG
  if (colorfgbg) {
    const parts = colorfgbg.split(";")
    const bg = Number.parseInt(parts[parts.length - 1], 10)
    if (!Number.isNaN(bg)) {
      return bg > 6 ? "light" : "dark"
    }
  }

  return "dark"
}

/**
 * Resolve an appearance setting to a concrete "dark" or "light" value.
 */
function resolveAppearance(appearance: Appearance): "dark" | "light" {
  if (appearance === "os") return detectOsAppearance()
  return appearance
}

// ── Invalidation ────────────────────────────────────────────────────

/** Invalidate caches that depend on the active theme colors. */
function invalidateThemeCaches(): void {
  _markdownSyntaxStyle = null
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Initialize the theme system. Call once at startup after loading config.
 *
 * @param themeName - Theme family name (e.g. "selenized", "solarized") or legacy slug (e.g. "selenized-dark")
 * @param appearance - Appearance mode: "dark", "light", or "os" (auto-detect). Defaults to "dark".
 */
export function initTheme(themeName?: string, appearance?: Appearance): void {
  const name = themeName || DEFAULT_THEME_NAME
  activeAppearance = appearance || DEFAULT_APPEARANCE
  resolvedAppearance = resolveAppearance(activeAppearance)

  // Backward compat: if a legacy name like "selenized-dark" is passed,
  // extract the appearance from the suffix
  const legacy = parseLegacyName(name)
  if (legacy && !appearance) {
    activeAppearance = legacy.variant
    resolvedAppearance = legacy.variant
  }

  activeFamily = resolveFamily(legacy ? legacy.family : name)
  activeTheme = resolvedAppearance === "light" ? activeFamily.light : activeFamily.dark
  invalidateThemeCaches()
}

/**
 * Get the name of the currently active theme family.
 */
export function getActiveThemeName(): string {
  return activeFamily?.name || DEFAULT_THEME_NAME
}

/**
 * Switch to a different theme family at runtime.
 * Keeps the current appearance (dark/light).
 *
 * @param themeName - Theme family name (e.g. "selenized", "solarized")
 */
export function setTheme(themeName: string): void {
  activeFamily = resolveFamily(themeName)
  activeTheme = resolvedAppearance === "light" ? activeFamily.light : activeFamily.dark
  invalidateThemeCaches()
}

/**
 * Toggle the appearance between dark and light at runtime.
 * Returns the new resolved appearance.
 */
export function toggleAppearance(): "dark" | "light" {
  resolvedAppearance = resolvedAppearance === "dark" ? "light" : "dark"
  activeAppearance = resolvedAppearance

  if (activeFamily) {
    activeTheme = resolvedAppearance === "light" ? activeFamily.light : activeFamily.dark
  }
  invalidateThemeCaches()
  return resolvedAppearance
}

/**
 * Set the appearance explicitly at runtime.
 * Returns the new resolved appearance.
 */
export function setAppearance(appearance: Appearance): "dark" | "light" {
  activeAppearance = appearance
  resolvedAppearance = resolveAppearance(appearance)

  if (activeFamily) {
    activeTheme = resolvedAppearance === "light" ? activeFamily.light : activeFamily.dark
  }
  invalidateThemeCaches()
  return resolvedAppearance
}

/**
 * Get the current resolved appearance ("dark" or "light").
 */
export function getAppearance(): "dark" | "light" {
  return resolvedAppearance
}

/**
 * List available theme families — combines built-in families with filesystem themes.
 * Returns family names (e.g. "selenized", "solarized"), not variant slugs.
 */
export function listThemes(): { name: string; source: "builtin" | "file" }[] {
  const themes = new Map<string, "builtin" | "file">()

  // Add built-in families
  for (const name of Object.keys(BUILTIN_FAMILIES)) {
    themes.set(name, "builtin")
  }

  // Overlay with filesystem themes — only family-format files (not legacy -dark/-light variants)
  const dir = getThemesDir()
  if (existsSync(dir)) {
    try {
      const files = readdirSync(dir)
      for (const file of files) {
        if (file.endsWith(".json")) {
          const slug = file.replace(/\.json$/, "")
          // Skip legacy variant files — only family files are supported
          if (parseLegacyName(slug)) continue
          themes.set(slug, "file")
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

// ── Markdown Syntax Style ───────────────────────────────────────────
// Lazily-created SyntaxStyle for the <markdown> component, themed to
// match the active vault0 color palette.

import { SyntaxStyle } from "@opentui/core"

let _markdownSyntaxStyle: SyntaxStyle | null = null

/** Get a SyntaxStyle for the <markdown> component, themed to the active palette. */
export function getMarkdownSyntaxStyle(): SyntaxStyle {
  if (_markdownSyntaxStyle) return _markdownSyntaxStyle
  _markdownSyntaxStyle = SyntaxStyle.fromStyles({
    "markup.heading.1": { fg: RGBA.fromHex(theme.blue), bold: true },
    "markup.heading.2": { fg: RGBA.fromHex(theme.blue), bold: true },
    "markup.heading.3": { fg: RGBA.fromHex(theme.cyan), bold: true },
    "markup.heading.4": { fg: RGBA.fromHex(theme.cyan) },
    "markup.heading.5": { fg: RGBA.fromHex(theme.cyan) },
    "markup.heading.6": { fg: RGBA.fromHex(theme.cyan) },
    "markup.bold": { fg: RGBA.fromHex(theme.fg_1), bold: true },
    "markup.italic": { fg: RGBA.fromHex(theme.fg_1), italic: true },
    "markup.list": { fg: RGBA.fromHex(theme.yellow) },
    "markup.raw": { fg: RGBA.fromHex(theme.cyan) },
    "markup.link": { fg: RGBA.fromHex(theme.blue) },
    "markup.link.url": { fg: RGBA.fromHex(theme.dim_0) },
    default: { fg: RGBA.fromHex(theme.fg_0) },
  })
  return _markdownSyntaxStyle
}
