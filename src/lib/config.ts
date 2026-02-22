import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

// ── Config Types ────────────────────────────────────────────────────────

export interface Vault0Config {
  /**
   * Board display settings.
   * Reserved for future use — themes, visible columns, etc.
   */
  board?: {
    /** Which status columns to display (default: all) */
    visibleStatuses?: string[]
    /** Default priority for new tasks */
    defaultPriority?: string
    /** Default task type for new tasks */
    defaultType?: string
  }

  /**
   * Theme overrides.
   * Reserved for future use — will be expanded with the themes feature.
   */
  theme?: {
    /** Name of a built-in theme or path to a custom theme file */
    name?: string
  }
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
 * Only handles the known two-level structure (no recursive generic merge).
 */
function mergeConfigs(
  global: Partial<Vault0Config>,
  project: Partial<Vault0Config>,
): Vault0Config {
  const merged: Vault0Config = {}

  // Merge board section
  if (global.board || project.board) {
    merged.board = { ...global.board, ...project.board }
  }

  // Merge theme section
  if (global.theme || project.theme) {
    merged.theme = { ...global.theme, ...project.theme }
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
