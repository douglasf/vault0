import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

// ── Config Types ────────────────────────────────────────────────────────

export type Appearance = "dark" | "light" | "os"

// ── Integration Config Types ────────────────────────────────────────────

/** Instruction block for a specific agent within an integration */
export interface AgentConfig {
  /** Ordered list of instruction blocks to inject for this agent */
  instructions?: string[]
}

/** Configuration for a single integration (e.g. "opencode") */
export interface IntegrationConfig {
  /** Per-agent configuration keyed by agent name */
  agents?: Record<string, AgentConfig>
}

/** Top-level integrations section of the config */
export interface IntegrationsConfig {
  [integrationName: string]: IntegrationConfig
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
   * Integration configurations keyed by integration name.
   * Example: `{ "opencode": { "agents": { "wolf": { "instructions": ["block1"] } } } }`
   */
  integrations?: IntegrationsConfig
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
/**
 * Validate and normalize an integrations config object.
 * Strips invalid entries and ensures correct shape.
 */
function validateIntegrations(raw: unknown): IntegrationsConfig | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined

  const result: IntegrationsConfig = {}
  for (const [intName, intValue] of Object.entries(raw as Record<string, unknown>)) {
    if (!intValue || typeof intValue !== "object" || Array.isArray(intValue)) continue
    const intObj = intValue as Record<string, unknown>

    const agents = intObj.agents
    if (!agents || typeof agents !== "object" || Array.isArray(agents)) {
      result[intName] = { agents: {} }
      continue
    }

    const validAgents: Record<string, AgentConfig> = {}
    for (const [agentName, agentValue] of Object.entries(agents as Record<string, unknown>)) {
      if (!agentValue || typeof agentValue !== "object" || Array.isArray(agentValue)) continue
      const agentObj = agentValue as Record<string, unknown>

      const instructions = Array.isArray(agentObj.instructions)
        ? agentObj.instructions.filter((i): i is string => typeof i === "string")
        : undefined

      validAgents[agentName] = { instructions }
    }

    result[intName] = { agents: validAgents }
  }

  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * Deep-merge two integrations config objects. Project values override global values.
 * Agent-level merge: project agent config replaces global agent config entirely.
 */
function mergeIntegrations(
  global?: IntegrationsConfig,
  project?: IntegrationsConfig,
): IntegrationsConfig | undefined {
  if (!global && !project) return undefined

  const allKeys = new Set([
    ...Object.keys(global ?? {}),
    ...Object.keys(project ?? {}),
  ])

  const merged: IntegrationsConfig = {}
  for (const intName of allKeys) {
    const gInt = global?.[intName]
    const pInt = project?.[intName]

    // Merge agents maps — project agent replaces global agent entirely
    const gAgents = gInt?.agents ?? {}
    const pAgents = pInt?.agents ?? {}
    const allAgents = new Set([...Object.keys(gAgents), ...Object.keys(pAgents)])

    const mergedAgents: Record<string, AgentConfig> = {}
    for (const agentName of allAgents) {
      mergedAgents[agentName] = pAgents[agentName] ?? gAgents[agentName]
    }

    merged[intName] = { agents: mergedAgents }
  }

  return merged
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

  // Merge integrations section
  const mergedIntegrations = mergeIntegrations(
    validateIntegrations(global.integrations),
    validateIntegrations(project.integrations),
  )
  if (mergedIntegrations) {
    merged.integrations = mergedIntegrations
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

  // Deep-merge integrations section
  if (updates.integrations) {
    const merged = mergeIntegrations(
      validateIntegrations(existing.integrations),
      validateIntegrations(updates.integrations),
    )
    if (merged) {
      existing.integrations = merged
    }
  }

  ensureGlobalConfig()
  writeFileSync(configPath, `${JSON.stringify(existing, null, 2)}\n`, "utf-8")
}

/**
 * Get instruction blocks for a specific agent within an integration.
 * Returns an empty array if the integration, agent, or instructions are not configured.
 */
export function getAgentInstructions(
  config: Vault0Config,
  integration: string,
  agentName: string,
): string[] {
  return config.integrations?.[integration]?.agents?.[agentName]?.instructions ?? []
}
