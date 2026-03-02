import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs"
import { join, basename } from "node:path"
import { execSync } from "node:child_process"
import { homedir } from "node:os"
import { createInterface } from "node:readline"
import { saveGlobalConfig } from "../lib/config.js"
import type { IntegrationsConfig } from "../lib/config.js"
import { BLOCK_DESCRIPTORS, getDefaultBlocksForAgent, guessRoleForAgent } from "../lib/instructions/block-descriptions.js"
import { OPENCODE_PLUGIN_TEMPLATE } from "./plugin-template.js"

// ── Types ───────────────────────────────────────────────────────────

type IntegrationMode = "mcp" | "direct"

interface AgentConfig {
  blocks: string[]
  tools: Record<string, boolean>
}

interface WriteAction {
  path: string
  description: string
  content: string
}

// ── Constants ───────────────────────────────────────────────────────

const VAULT0_CONFIG_DIR = join(homedir(), ".config", "vault0")
const VAULT0_CONFIG_PATH = join(VAULT0_CONFIG_DIR, "config.json")
const OPENCODE_DIR = join(VAULT0_CONFIG_DIR, "opencode")
const OPENCODE_CONFIG_PATH = join(OPENCODE_DIR, "opencode.jsonc")

/** All vault0 MCP tools */
const ALL_VAULT0_TOOLS = [
  "vault0_task-add",
  "vault0_task-list",
  "vault0_task-view",
  "vault0_task-update",
  "vault0_task-move",
  "vault0_task-subtasks",
  "vault0_task-complete",
]

const PLUGINS_DIR = join(OPENCODE_DIR, "plugins")
const PLUGIN_PATH = join(PLUGINS_DIR, "vault0.ts")

/** Base MCP config structure (without agent section — that gets merged in) */
const BASE_MCP_CONFIG: Record<string, unknown> = {
  "$schema": "https://opencode.ai/config.json",
  mcp: {
    vault0: {
      type: "local",
      command: ["vault0", "mcp-serve"],
      enabled: true,
    },
  },
}

/** Default tool permissions per role archetype */
const DEFAULT_TOOL_PRESETS: Record<string, Record<string, boolean>> = {
  orchestrator: {
    "vault0_task-add": true,
    "vault0_task-list": true,
    "vault0_task-view": true,
    "vault0_task-update": true,
    "vault0_task-move": true,
    "vault0_task-subtasks": true,
    "vault0_task-complete": false,
  },
  executor: {
    "vault0_task-add": false,
    "vault0_task-list": true,
    "vault0_task-view": true,
    "vault0_task-update": true,
    "vault0_task-move": true,
    "vault0_task-subtasks": true,
    "vault0_task-complete": false,
  },
  planner: {
    "vault0_task-add": true,
    "vault0_task-list": true,
    "vault0_task-view": true,
    "vault0_task-update": true,
    "vault0_task-move": false,
    "vault0_task-complete": false,
    "vault0_task-subtasks": true,
  },
  "git-agent": {
    "vault0_task-add": false,
    "vault0_task-list": true,
    "vault0_task-view": true,
    "vault0_task-update": false,
    "vault0_task-move": false,
    "vault0_task-complete": true,
    "vault0_task-subtasks": false,
  },
  "all-tools": {
    "vault0_task-add": true,
    "vault0_task-list": true,
    "vault0_task-view": true,
    "vault0_task-update": true,
    "vault0_task-move": true,
    "vault0_task-subtasks": true,
    "vault0_task-complete": true,
  },
}

/** System agents to always filter out (internal opencode agents) */
const SYSTEM_AGENTS = new Set([
  "compaction", "explore", "general", "summary", "title",
])

// ── JSONC Parsing ───────────────────────────────────────────────────

/** Strip single-line (//) and multi-line comments from JSONC content */
function stripJsoncComments(content: string): string {
  let result = ""
  let i = 0
  let inString = false
  let stringChar = ""

  while (i < content.length) {
    if (inString) {
      if (content[i] === "\\" && i + 1 < content.length) {
        result += content[i] + content[i + 1]
        i += 2
        continue
      }
      if (content[i] === stringChar) {
        inString = false
      }
      result += content[i]
      i++
      continue
    }

    if (content[i] === '"' || content[i] === "'") {
      inString = true
      stringChar = content[i]
      result += content[i]
      i++
      continue
    }

    if (content[i] === "/" && content[i + 1] === "/") {
      while (i < content.length && content[i] !== "\n") i++
      continue
    }

    if (content[i] === "/" && content[i + 1] === "*") {
      i += 2
      while (i < content.length && !(content[i] === "*" && content[i + 1] === "/")) i++
      i += 2
      continue
    }

    result += content[i]
    i++
  }

  return result
}

/** Parse a JSON or JSONC file, stripping trailing commas and comments */
function parseJsonc(content: string): unknown {
  const stripped = stripJsoncComments(content)
  const cleaned = stripped.replace(/,\s*([}\]])/g, "$1")
  return JSON.parse(cleaned)
}

/** Safely read and parse a JSON/JSONC file, returning null on failure */
function readJsonFile(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null
    const raw = readFileSync(path, "utf-8").trim()
    if (!raw) return null
    return parseJsonc(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

// ── Agent Detection ─────────────────────────────────────────────────

/** Parse agent names from `opencode agent list` output */
function parseAgentListOutput(output: string): string[] {
  const agents: string[] = []
  for (const line of output.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("─") || trimmed.startsWith("NAME") || trimmed.startsWith("=")) continue
    const name = trimmed.split(/\s+/)[0]
    if (name && /^[a-z][a-z0-9-]*$/.test(name)) {
      agents.push(name)
    }
  }
  return agents
}

/** Detect OpenCode agents by running `opencode agent list` */
function detectAgents(showAll = false): string[] {
  try {
    const output = execSync("opencode agent list", {
      encoding: "utf-8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    })
    const allAgents = parseAgentListOutput(output)
    if (showAll) return allAgents.sort()
    return allAgents.filter(name => !SYSTEM_AGENTS.has(name)).sort()
  } catch {
    console.log("  Warning: Could not run 'opencode agent list'. No agents detected.")
    return []
  }
}

// ── Interactive Wizard Helpers ──────────────────────────────────────

type RL = ReturnType<typeof createInterface>

async function askYesNo(rl: RL, question: string, defaultYes = true): Promise<boolean> {
  const suffix = defaultYes ? "[Y/n]" : "[y/N]"
  return new Promise(resolve => {
    rl.question(`${question} ${suffix} `, answer => {
      const a = answer.trim().toLowerCase()
      if (a === "") resolve(defaultYes)
      else resolve(a === "y" || a === "yes")
    })
  })
}

async function askChoice(rl: RL, question: string, choices: string[], defaultChoice?: string): Promise<string> {
  return new Promise(resolve => {
    const defaultIdx = defaultChoice ? choices.indexOf(defaultChoice) + 1 : 1
    rl.question(`${question} [${defaultIdx}]: `, answer => {
      const idx = Number.parseInt(answer.trim(), 10)
      if (idx >= 1 && idx <= choices.length) resolve(choices[idx - 1])
      else resolve(choices[defaultIdx - 1])
    })
  })
}

async function askMultiToggle(
  rl: RL,
  items: Array<{ name: string, description: string, enabled: boolean }>,
  label: string,
): Promise<string[]> {
  console.log(`\n    ${label}`)
  console.log("    Toggle items by number, 'a' for all, 'n' for none, Enter to confirm.\n")

  const state = items.map(i => ({ ...i }))

  const printState = () => {
    for (let i = 0; i < state.length; i++) {
      const check = state[i].enabled ? "[x]" : "[ ]"
      console.log(`    ${i + 1}. ${check} ${state[i].name} — ${state[i].description}`)
    }
    console.log()
  }

  printState()

  return new Promise(resolve => {
    const prompt = () => {
      rl.question("    Toggle (number/a/n/Enter): ", answer => {
        const a = answer.trim().toLowerCase()
        if (a === "") {
          resolve(state.filter(s => s.enabled).map(s => s.name))
          return
        }
        if (a === "a") {
          for (const s of state) s.enabled = true
          printState()
          prompt()
          return
        }
        if (a === "n") {
          for (const s of state) s.enabled = false
          printState()
          prompt()
          return
        }
        const idx = Number.parseInt(a, 10)
        if (idx >= 1 && idx <= state.length) {
          state[idx - 1].enabled = !state[idx - 1].enabled
          printState()
        }
        prompt()
      })
    }
    prompt()
  })
}

// ── Interactive Wizard ──────────────────────────────────────────────

async function runWizard(detectedAgents: string[]): Promise<{ mode: IntegrationMode, agents: Map<string, AgentConfig> }> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const agents = new Map<string, AgentConfig>()
  let mode: IntegrationMode = "mcp"

  try {
    console.log("\n  Vault0 OpenCode Configuration Wizard")
    console.log("  ====================================\n")

    // ── Step 1: Mode Selection ──────────────────────────────────────
    console.log("  Integration Mode:")
    console.log("    1. MCP  — vault0 runs as an MCP server (recommended)")
    console.log("    2. Direct — vault0 tools are loaded as OpenCode custom tools")
    console.log()
    mode = await askChoice(rl, "  Choose mode", ["mcp", "direct"], "mcp") as IntegrationMode
    console.log(`\n  → Using ${mode.toUpperCase()} mode\n`)

    // ── Step 2: Agent Detection ─────────────────────────────────────
    if (detectedAgents.length > 0) {
      console.log(`  Detected agents: ${detectedAgents.join(", ")}`)
    } else {
      console.log("  No agents detected. Run 'opencode agent list' to verify your setup.")
      rl.close()
      return { mode, agents }
    }
    console.log()

    // ── Step 3: Per-Agent Configuration ─────────────────────────────
    for (const agent of detectedAgents) {
      const enable = await askYesNo(rl, `  Configure vault0 for agent "${agent}"?`, true)
      if (!enable) continue

      // Block selection with descriptions
      const defaultBlocks = getDefaultBlocksForAgent(agent)
      const blockItems = BLOCK_DESCRIPTORS.map(b => ({
        name: b.name,
        description: b.description,
        enabled: defaultBlocks.includes(b.name),
      }))

      const selectedBlocks = await askMultiToggle(rl, blockItems, `Instruction blocks for "${agent}":`)

      // Tool selection
      const presetNames = Object.keys(DEFAULT_TOOL_PRESETS)
      console.log(`\n    Tool presets for "${agent}":`)
      for (let i = 0; i < presetNames.length; i++) {
        const p = presetNames[i]
        const enabled = ALL_VAULT0_TOOLS.filter(t => DEFAULT_TOOL_PRESETS[p][t])
        console.log(`      ${i + 1}. ${p} (${enabled.length}/${ALL_VAULT0_TOOLS.length} tools)`)
      }
      console.log(`      ${presetNames.length + 1}. custom — choose individual tools`)
      console.log()

      const presetAnswer = await askChoice(
        rl,
        "    Tool preset",
        [...presetNames, "custom"],
        guessPresetForAgent(agent),
      )

      let tools: Record<string, boolean>
      if (presetAnswer === "custom") {
        const toolItems = ALL_VAULT0_TOOLS.map(t => ({
          name: t,
          description: t.replace("vault0_task-", ""),
          enabled: true,
        }))
        const selectedTools = await askMultiToggle(rl, toolItems, `Tools for "${agent}":`)
        tools = {}
        for (const t of ALL_VAULT0_TOOLS) {
          tools[t] = selectedTools.includes(t)
        }
      } else {
        tools = { ...DEFAULT_TOOL_PRESETS[presetAnswer] }
      }

      agents.set(agent, { blocks: selectedBlocks, tools })
      console.log()
    }
  } finally {
    rl.close()
  }

  return { mode, agents }
}

/** Guess the most likely tool preset for a given agent name */
function guessPresetForAgent(agent: string): string {
  return guessRoleForAgent(agent)
}

// ── Config Generation ───────────────────────────────────────────────

/** Generate the integration config for ~/.config/vault0/config.json */
function generateIntegrationConfig(agentMap: Map<string, AgentConfig>): IntegrationsConfig {
  const agentEntries: Record<string, { instructions: string[] }> = {}
  for (const [agent, config] of agentMap) {
    agentEntries[agent] = { instructions: config.blocks }
  }
  return {
    opencode: { agents: agentEntries },
  }
}

/** Generate the agent section for opencode.jsonc */
function generateAgentSection(agentMap: Map<string, AgentConfig>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [agent, config] of agentMap) {
    const enabledTools = ALL_VAULT0_TOOLS.filter(t => config.tools[t])
    const permission: Record<string, string> = {}
    for (const t of enabledTools) {
      permission[t] = "allow"
    }
    result[agent] = {
      tools: { ...config.tools },
      permission,
    }
  }
  return result
}

/** Merge agent config into the base opencode.jsonc that was copied by make */
function mergeIntoOpenCodeConfig(basePath: string, agentSection: Record<string, unknown>): string {
  const existing = readJsonFile(basePath) ?? {}
  // Ensure base MCP structure is always present
  if (!existing["$schema"]) existing["$schema"] = BASE_MCP_CONFIG.$schema
  if (!existing.mcp) existing.mcp = BASE_MCP_CONFIG.mcp
  existing.agent = agentSection
  return `${JSON.stringify(existing, null, 2)}\n`
}

// ── File Writing with Backup ────────────────────────────────────────

function backupFile(path: string): string | null {
  if (!existsSync(path)) return null
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = `${path}.backup-${timestamp}`
  copyFileSync(path, backupPath)
  return backupPath
}

// ── Main Command ────────────────────────────────────────────────────

/**
 * Run `vault0 configure opencode` command.
 *
 * @param flags - CLI flags (--dry-run, --defaults, --all)
 * @returns exit code
 */
export async function cmdConfigureOpencode(flags: Record<string, string>): Promise<number> {
  const dryRun = flags["dry-run"] === "true"
  const useDefaults = flags.defaults === "true"
  const showAll = flags.all === "true"

  console.log("Configuring vault0 for OpenCode integration...")
  if (dryRun) console.log("  (dry-run mode — no files will be written)\n")

  // 1. Detect agents
  const detectedAgents = detectAgents(showAll)

  // 2. Get configuration (interactive or defaults)
  let mode: IntegrationMode = "mcp"
  let agentMap: Map<string, AgentConfig>

  if (useDefaults) {
    agentMap = new Map<string, AgentConfig>()
    for (const agent of detectedAgents) {
      const defaultBlocks = getDefaultBlocksForAgent(agent)
      const preset = guessPresetForAgent(agent)
      agentMap.set(agent, {
        blocks: defaultBlocks.length > 0 ? defaultBlocks : ["tool-reference", "task-execution"],
        tools: { ...DEFAULT_TOOL_PRESETS[preset] },
      })
    }
    if (agentMap.size === 0) {
      console.log("  No agents detected. Cannot use --defaults without agents.\n")
      return 1
    }
    console.log(`  Using defaults for: ${[...agentMap.keys()].join(", ")}\n`)
  } else {
    const wizardResult = await runWizard(detectedAgents)
    mode = wizardResult.mode
    agentMap = wizardResult.agents
  }

  if (agentMap.size === 0) {
    console.log("  No agents enabled. Nothing to configure.")
    return 0
  }

  // 3. Install base config files (plugin + directories)
  if (!dryRun) {
    console.log("  Installing base config files...")
    mkdirSync(PLUGINS_DIR, { recursive: true })
    writeFileSync(PLUGIN_PATH, OPENCODE_PLUGIN_TEMPLATE, "utf-8")
    console.log(`  Wrote plugin: ${PLUGIN_PATH}`)
    console.log("  Base config files installed.\n")
  }

  // 4. Generate configs
  const integrationConfig = generateIntegrationConfig(agentMap)
  const agentSection = generateAgentSection(agentMap)

  // 5. Build write actions
  const actions: WriteAction[] = []

  // Merge agent tools/permissions into base opencode.jsonc
  const mergedOpenCodeContent = mergeIntoOpenCodeConfig(OPENCODE_CONFIG_PATH, agentSection)
  actions.push({
    path: OPENCODE_CONFIG_PATH,
    description: "OpenCode config (agent tools & permissions)",
    content: mergedOpenCodeContent,
  })

  // 6. Display summary
  console.log("  Configuration Summary")
  console.log("  ---------------------")
  console.log(`  Mode: ${mode.toUpperCase()}`)
  console.log()
  console.log("  Agents:")
  for (const [agent, config] of agentMap) {
    const enabledTools = ALL_VAULT0_TOOLS.filter(t => config.tools[t])
    console.log(`    ${agent}:`)
    console.log(`      blocks: ${config.blocks.join(", ") || "(none)"}`)
    console.log(`      tools:  ${enabledTools.join(", ") || "(none)"}`)
  }
  console.log()

  if (dryRun) {
    console.log("  Files that would be written:\n")
    for (const action of actions) {
      console.log(`  ${action.path}`)
      console.log(`    ${action.description}`)
      console.log()
    }
    console.log("  Vault0 config that would be saved:")
    console.log(`    ${JSON.stringify(integrationConfig, null, 2).split("\n").join("\n    ")}`)
    console.log()
    console.log("  (dry-run — no changes made)")
    return 0
  }

  // 7. Write files
  const backups: string[] = []

  for (const action of actions) {
    const dir = action.path.substring(0, action.path.lastIndexOf("/"))
    mkdirSync(dir, { recursive: true })

    const backup = backupFile(action.path)
    if (backup) {
      backups.push(backup)
      console.log(`  Backed up: ${action.path} -> ${basename(backup)}`)
    }

    writeFileSync(action.path, action.content, "utf-8")
    console.log(`  Wrote: ${action.path}`)
  }

  // Save integration config (agent→blocks mapping) via vault0's own config system
  saveGlobalConfig({ integrations: integrationConfig })
  console.log(`  Updated: ${VAULT0_CONFIG_PATH} (agent→block mappings)`)

  console.log()
  if (backups.length > 0) {
    console.log(`  ${backups.length} backup(s) created.`)
  }
  console.log("  Configuration complete!")
  console.log()
  console.log("  Next steps:")
  console.log("    1. Set OPENCODE_CONFIG_DIR=~/.config/vault0/opencode in your shell")
  console.log("    2. Restart OpenCode to pick up the new config")

  return 0
}
