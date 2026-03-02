import { describe, test, expect } from "bun:test"
import { loadConfig, getAgentInstructions } from "../lib/config.js"
import type { Vault0Config, IntegrationsConfig } from "../lib/config.js"

// ═══════════════════════════════════════════════════════════════════
// getAgentInstructions
// ═══════════════════════════════════════════════════════════════════

describe("getAgentInstructions", () => {
  test("returns instructions for configured agent", () => {
    const config: Vault0Config = {
      integrations: {
        opencode: {
          agents: {
            wolf: { instructions: ["execution-core", "error-handling"] },
          },
        },
      },
    }

    const result = getAgentInstructions(config, "opencode", "wolf")
    expect(result).toEqual(["execution-core", "error-handling"])
  })

  test("returns empty array for unconfigured agent", () => {
    const config: Vault0Config = {
      integrations: {
        opencode: {
          agents: {
            wolf: { instructions: ["execution-core"] },
          },
        },
      },
    }

    const result = getAgentInstructions(config, "opencode", "vincent")
    expect(result).toEqual([])
  })

  test("returns empty array for unconfigured integration", () => {
    const config: Vault0Config = {}
    const result = getAgentInstructions(config, "opencode", "wolf")
    expect(result).toEqual([])
  })

  test("returns empty array when integrations is undefined", () => {
    const config: Vault0Config = { theme: { name: "test" } }
    const result = getAgentInstructions(config, "opencode", "wolf")
    expect(result).toEqual([])
  })

  test("returns empty array when agent has no instructions", () => {
    const config: Vault0Config = {
      integrations: {
        opencode: {
          agents: {
            wolf: {},
          },
        },
      },
    }

    const result = getAgentInstructions(config, "opencode", "wolf")
    expect(result).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════
// Config merge behavior (tested via loadConfig with nonexistent paths)
// ═══════════════════════════════════════════════════════════════════

describe("loadConfig", () => {
  test("returns empty config for nonexistent repo root", () => {
    // loadConfig gracefully handles missing files
    const config = loadConfig(`/tmp/nonexistent-vault0-test-repo-${Date.now()}`)
    expect(config).toBeDefined()
    // Should not throw, returns merged (possibly empty) config
  })
})

// ═══════════════════════════════════════════════════════════════════
// Integration config composition
// ═══════════════════════════════════════════════════════════════════

describe("integration config composition", () => {
  test("multiple agents can be configured independently", () => {
    const config: Vault0Config = {
      integrations: {
        opencode: {
          agents: {
            orchestrator: { instructions: ["orchestration-core", "delegation-patterns", "task-discovery"] },
            wolf: { instructions: ["execution-core", "error-handling"] },
            vincent: { instructions: ["investigation-methodology"] },
            architect: { instructions: ["planning-methodology", "task-composition"] },
            git: { instructions: ["git-workflow", "post-commit-approval"] },
          },
        },
      },
    }

    expect(getAgentInstructions(config, "opencode", "orchestrator")).toEqual([
      "orchestration-core", "delegation-patterns", "task-discovery",
    ])
    expect(getAgentInstructions(config, "opencode", "wolf")).toEqual([
      "execution-core", "error-handling",
    ])
    expect(getAgentInstructions(config, "opencode", "vincent")).toEqual([
      "investigation-methodology",
    ])
    expect(getAgentInstructions(config, "opencode", "architect")).toEqual([
      "planning-methodology", "task-composition",
    ])
    expect(getAgentInstructions(config, "opencode", "git")).toEqual([
      "git-workflow", "post-commit-approval",
    ])
  })

  test("different integrations are independent", () => {
    const config: Vault0Config = {
      integrations: {
        opencode: {
          agents: {
            wolf: { instructions: ["execution-core"] },
          },
        },
        cursor: {
          agents: {
            default: { instructions: ["orchestration-core", "execution-core"] },
          },
        },
      },
    }

    expect(getAgentInstructions(config, "opencode", "wolf")).toEqual(["execution-core"])
    expect(getAgentInstructions(config, "cursor", "default")).toEqual(["orchestration-core", "execution-core"])
    expect(getAgentInstructions(config, "opencode", "default")).toEqual([])
  })
})
