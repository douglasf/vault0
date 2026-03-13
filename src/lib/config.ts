import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { Status, SortField, Filters } from "./types.js"

// ── Config Types ────────────────────────────────────────────────────────

export type Appearance = "dark" | "light" | "os"

// ── Lane Policy Types ───────────────────────────────────────────────────

/**
 * Policy for a single lane (status column).
 * Omitted fields use defaults: visible=true, no WIP limit.
 */
export interface LanePolicy {
  /** Whether this lane is shown as a board column. Defaults to true. */
  visible?: boolean
  /** Maximum number of tasks allowed in this lane. Undefined = unlimited. */
  wipLimit?: number
}

/**
 * Per-lane policy configuration. Keys are Status values.
 * Only lanes with non-default settings need entries.
 */
export type LanePolicies = Partial<Record<Status, LanePolicy>>

// ── UI Persistence Types ────────────────────────────────────────────────

/**
 * Persisted UI state for stable board context across sessions.
 * Only non-default values should be written to disk.
 * Transient state (modals, detail selection, help, navigation cursor) is excluded.
 */
export interface UiConfig {
  /** Currently active board ID */
  currentBoardId?: string
  /** Sort field for task columns */
  sortField?: SortField
  /** Whether the task preview pane is visible */
  previewVisible?: boolean
  /** Whether subtasks are hidden from the board view */
  hideSubtasks?: boolean
  /** Coarse top-level view to restore across sessions */
  activeView?: "board" | "releases" | "archive"
  /** Persisted filter settings */
  filters?: Partial<Omit<Filters, "search">>
}

/** Default values for all UI config fields */
export const UI_CONFIG_DEFAULTS: Required<Omit<UiConfig, "currentBoardId" | "filters">> = {
  sortField: "priority",
  previewVisible: false,
  hideSubtasks: false,
  activeView: "board",
}

// ── Main Config ─────────────────────────────────────────────────────────

export interface Vault0Config {
  /**
   * Theme configuration.
   * `name` is the theme family (e.g. "selenized"), `appearance` controls light/dark variant.
   */
  theme?: {
    /** Name of a theme family (e.g. "selenized", "solarized") or a custom theme file name */
    name?: string
    /** Appearance mode: "dark", "light", or "os" (auto-detect from OS). Defaults to "dark". */
    appearance?: Appearance
  }
  /**
   * Per-lane policies: visibility, WIP limits, and creation rules.
   * Keys are status names (e.g. "in_progress", "done").
   */
  lanePolicies?: LanePolicies
  /**
   * Persisted UI state for stable board context across sessions.
   * Only stored in project-local config.
   */
  ui?: UiConfig
}

// ── Paths ───────────────────────────────────────────────────────────────

/** Global config directory: ~/.config/vault0/ */
export function getGlobalConfigDir(): string {
  return join(homedir(), ".config", "vault0")
}

/** Global config file: ~/.config/vault0/config.json */
export function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), "config.json")
}

/** Project-specific config file: <repoRoot>/.vault0/config.json */
export function getProjectConfigPath(repoRoot: string): string {
  return join(repoRoot, ".vault0", "config.json")
}

// ── Loading ─────────────────────────────────────────────────────────────

/**
 * Read and parse a JSON config file. Returns an empty object if the file
 * doesn't exist or can't be parsed.
 */
function loadConfigFile(path: string): Partial<Vault0Config> {
  try {
    if (!existsSync(path)) return {}
    const raw = readFileSync(path, "utf-8").trim()
    if (!raw) return {}
    return JSON.parse(raw) as Partial<Vault0Config>
  } catch {
    return {}
  }
}

/**
 * Deep-merge two config objects. Project values override global values.
 */
function mergeConfigs(
  global: Partial<Vault0Config>,
  project: Partial<Vault0Config>,
): Vault0Config {
  const merged: Vault0Config = {}

  // Merge theme section
  if (global.theme || project.theme) {
    merged.theme = { ...global.theme, ...project.theme }
  }

  // Merge lane policies — project overrides per-lane, global provides defaults
  if (global.lanePolicies || project.lanePolicies) {
    merged.lanePolicies = { ...global.lanePolicies, ...project.lanePolicies }
  }

  // Merge ui section — if local config has a `ui` key (even `{}`), it owns UI
  // state entirely. Missing fields resolve to defaults, NOT global values.
  // This makes `ui` presence a "this repo manages its own UI" signal.
  if ("ui" in project) {
    merged.ui = project.ui ?? {}
  } else if (global.ui) {
    merged.ui = global.ui
  }

  return merged
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Ensure the global config directory and a default config file exist.
 * Called once at startup. Creates ~/.config/vault0/config.json with an
 * empty object if it doesn't already exist.
 */
export function ensureGlobalConfig(): void {
  const dir = getGlobalConfigDir()
  mkdirSync(dir, { recursive: true })

  const configPath = getGlobalConfigPath()
  if (!existsSync(configPath)) {
    writeFileSync(configPath, "{}\n", "utf-8")
  }
}

/**
 * Load the effective configuration by merging global + project configs.
 *
 * Resolution order (later wins):
 *   1. ~/.config/vault0/config.json   (global defaults)
 *   2. <repoRoot>/.vault0/config.json (project overrides)
 */
export function loadConfig(repoRoot: string): Vault0Config {
  const global = loadConfigFile(getGlobalConfigPath())
  const project = loadConfigFile(getProjectConfigPath(repoRoot))
  return mergeConfigs(global, project)
}

/**
 * Update the global config file with the given partial config.
 * Deep-merges with the existing global config and writes back to disk.
 */
export function saveGlobalConfig(updates: Partial<Vault0Config>): void {
  const configPath = getGlobalConfigPath()
  const existing = loadConfigFile(configPath)

  // Deep-merge theme section
  if (updates.theme) {
    existing.theme = { ...existing.theme, ...updates.theme }
  }

  // Deep-merge lane policies section
  if (updates.lanePolicies) {
    existing.lanePolicies = { ...existing.lanePolicies, ...updates.lanePolicies }
  }

  ensureGlobalConfig()
  writeFileSync(configPath, `${JSON.stringify(existing, null, 2)}\n`, "utf-8")
}

// ── UI Config Pruning ──────────────────────────────────────────────────

/**
 * Remove UI config entries that match their default values.
 * Returns undefined if no non-default values remain.
 */
export function pruneDefaultUi(ui: UiConfig): UiConfig | undefined {
  const pruned: UiConfig = {}

  // Keep non-default scalars
  if (ui.currentBoardId !== undefined) pruned.currentBoardId = ui.currentBoardId
  if (ui.sortField !== undefined && ui.sortField !== UI_CONFIG_DEFAULTS.sortField) pruned.sortField = ui.sortField
  if (ui.previewVisible !== undefined && ui.previewVisible !== UI_CONFIG_DEFAULTS.previewVisible) pruned.previewVisible = ui.previewVisible
  if (ui.hideSubtasks !== undefined && ui.hideSubtasks !== UI_CONFIG_DEFAULTS.hideSubtasks) pruned.hideSubtasks = ui.hideSubtasks
  if (ui.activeView !== undefined && ui.activeView !== UI_CONFIG_DEFAULTS.activeView) pruned.activeView = ui.activeView

  // Keep non-empty filters
  if (ui.filters) {
    const f = ui.filters
    const kept: Partial<Omit<Filters, "search">> = {}
    let hasFilter = false
    for (const [key, val] of Object.entries(f)) {
      if (val === undefined || val === null) continue
      if (Array.isArray(val) && val.length === 0) continue
      if (val === false) continue
      ;(kept as Record<string, unknown>)[key] = val
      hasFilter = true
    }
    if (hasFilter) pruned.filters = kept
  }

  return Object.keys(pruned).length > 0 ? pruned : undefined
}

// ── Project-Local Config Persistence ────────────────────────────────────

/**
 * Update the project-local config file with the given partial config.
 * Deep-merges with the existing local config and writes back to disk.
 * Preserves non-Vault0 keys that may exist in the file.
 * If `updates.ui` is provided, it is pruned of default values via
 * `pruneDefaultUi()` before writing. Even when all UI values are defaults,
 * `ui: {}` is written to signal "this repo owns its UI state" and prevent
 * global UI from leaking through during merge.
 */
export function saveProjectConfig(repoRoot: string, updates: Partial<Vault0Config>): void {
  const configPath = getProjectConfigPath(repoRoot)
  const dir = join(repoRoot, ".vault0")

  // Load existing file as raw JSON to preserve unknown keys
  let existing: Record<string, unknown> = {}
  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, "utf-8").trim()
      if (raw) existing = JSON.parse(raw)
    }
  } catch { /* start fresh */ }

  // Deep-merge theme section
  if (updates.theme) {
    existing.theme = { ...(existing.theme as Record<string, unknown> ?? {}), ...updates.theme }
  }

  // Deep-merge lane policies section
  if (updates.lanePolicies) {
    existing.lanePolicies = { ...(existing.lanePolicies as Record<string, unknown> ?? {}), ...updates.lanePolicies }
  }

  // Prune default UI values, but always write `ui` key (even as `{}`)
  // to signal "this repo owns its UI state" and block global UI from leaking.
  if (updates.ui !== undefined) {
    const pruned = pruneDefaultUi(updates.ui)
    existing.ui = pruned ?? {}
  }

  mkdirSync(dir, { recursive: true })
  writeFileSync(configPath, `${JSON.stringify(existing, null, 2)}\n`, "utf-8")
}
