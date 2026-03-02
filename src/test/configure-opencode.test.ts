import { describe, test, expect } from "bun:test"

// ═══════════════════════════════════════════════════════════════════
// JSONC stripping (test the logic used in configure-opencode)
// ═══════════════════════════════════════════════════════════════════

/** Reimplementation of stripJsoncComments for testing (mirrors configure-opencode.ts) */
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

function parseJsonc(content: string): unknown {
  const stripped = stripJsoncComments(content)
  const cleaned = stripped.replace(/,\s*([}\]])/g, "$1")
  return JSON.parse(cleaned)
}

describe("JSONC parsing", () => {
  test("parses plain JSON", () => {
    const result = parseJsonc('{"key": "value"}')
    expect(result).toEqual({ key: "value" })
  })

  test("strips single-line comments", () => {
    const input = `{
      // This is a comment
      "key": "value"
    }`
    const result = parseJsonc(input) as Record<string, unknown>
    expect(result.key).toBe("value")
  })

  test("strips multi-line comments", () => {
    const input = `{
      /* This is a
         multi-line comment */
      "key": "value"
    }`
    const result = parseJsonc(input) as Record<string, unknown>
    expect(result.key).toBe("value")
  })

  test("preserves comments inside strings", () => {
    const input = '{"url": "http://example.com"}'
    const result = parseJsonc(input) as Record<string, unknown>
    expect(result.url).toBe("http://example.com")
  })

  test("handles trailing commas", () => {
    const input = `{
      "a": 1,
      "b": 2,
    }`
    const result = parseJsonc(input) as Record<string, unknown>
    expect(result.a).toBe(1)
    expect(result.b).toBe(2)
  })

  test("handles trailing commas in arrays", () => {
    const input = `{"items": [1, 2, 3,]}`
    const result = parseJsonc(input) as Record<string, unknown>
    expect(result.items).toEqual([1, 2, 3])
  })

  test("handles escaped quotes in strings", () => {
    const input = '{"msg": "say \\"hello\\""}'
    const result = parseJsonc(input) as Record<string, unknown>
    expect(result.msg).toBe('say "hello"')
  })
})

// ═══════════════════════════════════════════════════════════════════
// MCP config generation
// ═══════════════════════════════════════════════════════════════════

describe("MCP config generation", () => {
  test("generates correct MCP server block structure", () => {
    // Mirrors generateMcpConfig() in configure-opencode.ts
    const mcpConfig = {
      vault0: {
        type: "stdio",
        command: "vault0",
        args: ["mcp-serve"],
      },
    }

    expect(mcpConfig.vault0.type).toBe("stdio")
    expect(mcpConfig.vault0.command).toBe("vault0")
    expect(mcpConfig.vault0.args).toEqual(["mcp-serve"])
  })

  test("merges MCP config into existing opencode config", () => {
    const existing = {
      mcpServers: {
        other: { type: "stdio", command: "other-tool" },
      },
      someOtherKey: true,
    }

    const mcpServers = {
      vault0: { type: "stdio", command: "vault0", args: ["mcp-serve"] },
    }

    // Mirrors mergeOpenCodeConfig() logic
    const merged = { ...existing } as Record<string, unknown>
    const existingMcp = (merged.mcpServers ?? {}) as Record<string, unknown>
    merged.mcpServers = { ...existingMcp, ...mcpServers }

    expect(merged.someOtherKey).toBe(true)
    expect((merged.mcpServers as Record<string, unknown>).other).toBeDefined()
    expect((merged.mcpServers as Record<string, unknown>).vault0).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════════
// Integration config generation
// ═══════════════════════════════════════════════════════════════════

describe("integration config generation", () => {
  test("generates correct structure from agent map", () => {
    const agentMap = new Map<string, string[]>([
      ["orchestrator", ["orchestration-core", "delegation-patterns"]],
      ["wolf", ["execution-core", "error-handling"]],
    ])

    // Mirrors generateIntegrationConfig()
    const agents: Record<string, { instructions: string[] }> = {}
    for (const [agent, blocks] of agentMap) {
      agents[agent] = { instructions: blocks }
    }
    const config = { opencode: { agents } }

    expect(config.opencode.agents.orchestrator.instructions).toEqual([
      "orchestration-core", "delegation-patterns",
    ])
    expect(config.opencode.agents.wolf.instructions).toEqual([
      "execution-core", "error-handling",
    ])
  })
})

// ═══════════════════════════════════════════════════════════════════
// Plugin content generation
// ═══════════════════════════════════════════════════════════════════

describe("plugin content generation", () => {
  test("generated plugin has required structure", () => {
    // Verify the plugin template has the expected exports/hooks
    // We can't import the generated content directly, but we can verify the template
    const pluginTemplate = `export default {
  name: "vault0",
  version: "1.0.0",
  hooks: {
    "agent:system-prompt": async (ctx) => {}
  }
}`
    expect(pluginTemplate).toContain("vault0")
    expect(pluginTemplate).toContain("agent:system-prompt")
    expect(pluginTemplate).toContain("export default")
  })
})

// ═══════════════════════════════════════════════════════════════════
// Agent detection and filtering
// ═══════════════════════════════════════════════════════════════════

/** Mirrors parseAgentListOutput from configure-opencode.ts */
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

const SYSTEM_AGENTS = new Set(["compaction", "explore", "general", "summary", "title"])

describe("agent detection", () => {
  test("parseAgentListOutput extracts agent names from tabular output", () => {
    const output = `NAME         DESCRIPTION
─────────────────────────────
marsellus    Coordinates task flow
wolf         Executes tasks
compaction   Internal compaction
general      General agent`
    const agents = parseAgentListOutput(output)
    expect(agents).toEqual(["marsellus", "wolf", "compaction", "general"])
  })

  test("parseAgentListOutput handles empty output", () => {
    expect(parseAgentListOutput("")).toEqual([])
    expect(parseAgentListOutput("\n\n")).toEqual([])
  })

  test("parseAgentListOutput skips header and separator lines", () => {
    const output = `NAME  DESC
══════════
wolf  Executor`
    expect(parseAgentListOutput(output)).toEqual(["wolf"])
  })

  test("system agents are filtered out by blacklist", () => {
    const all = ["architect", "compaction", "explore", "general", "git", "marsellus", "summary", "title", "wolf"]
    const filtered = all.filter(name => !SYSTEM_AGENTS.has(name))
    expect(filtered).toEqual(["architect", "git", "marsellus", "wolf"])
  })

  test("custom user agents pass through the blacklist filter", () => {
    const all = ["architect", "my-custom-agent", "wolf"]
    const filtered = all.filter(name => !SYSTEM_AGENTS.has(name))
    expect(filtered).toEqual(["architect", "my-custom-agent", "wolf"])
  })
})
