import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { Status } from "./types.js"

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
