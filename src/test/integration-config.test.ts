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
            wolf: { instructions: ["tool-reference", "task-execution"] },
          },
        },
      },
    }

    const result = getAgentInstructions(config, "opencode", "wolf")
    expect(result).toEqual(["tool-reference", "task-execution"])
  })

  test("returns empty array for unconfigured agent", () => {
    const config: Vault0Config = {
      integrations: {
        opencode: {
          agents: {
            wolf: { instructions: ["tool-reference"] },
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
            orchestrator: { instructions: ["tool-reference", "task-delegation"] },
            wolf: { instructions: ["tool-reference", "task-execution"] },
            architect: { instructions: ["tool-reference", "task-planning"] },
            git: { instructions: ["tool-reference", "task-completion"] },
          },
        },
      },
    }

    expect(getAgentInstructions(config, "opencode", "orchestrator")).toEqual([
      "tool-reference", "task-delegation",
    ])
    expect(getAgentInstructions(config, "opencode", "wolf")).toEqual([
      "tool-reference", "task-execution",
    ])
    expect(getAgentInstructions(config, "opencode", "architect")).toEqual([
      "tool-reference", "task-planning",
    ])
    expect(getAgentInstructions(config, "opencode", "git")).toEqual([
      "tool-reference", "task-completion",
    ])
  })

  test("different integrations are independent", () => {
    const config: Vault0Config = {
      integrations: {
        opencode: {
          agents: {
            wolf: { instructions: ["tool-reference", "task-execution"] },
          },
        },
        cursor: {
          agents: {
            default: { instructions: ["tool-reference", "task-delegation", "task-execution"] },
          },
        },
      },
    }

    expect(getAgentInstructions(config, "opencode", "wolf")).toEqual(["tool-reference", "task-execution"])
    expect(getAgentInstructions(config, "cursor", "default")).toEqual(["tool-reference", "task-delegation", "task-execution"])
    expect(getAgentInstructions(config, "opencode", "default")).toEqual([])
  })
})
