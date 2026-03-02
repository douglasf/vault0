import type { Vault0Config } from "../lib/config.js"
import { getAgentInstructions } from "../lib/config.js"
import { getInstructionContent } from "../lib/instructions/content.js"

// ── Types ───────────────────────────────────────────────────────────

export interface IntegrationGetResult {
  instructions: string[]
}

// ── Command Handler ─────────────────────────────────────────────────

/**
 * Handle `vault0 integration get --integration=<name> --agent=<name> [--block=<name>]`.
 *
 * With --agent: returns the instruction block names for that agent.
 * With --block: returns the raw content of a single instruction block.
 * Without either: returns all agents for the integration.
 */
export function cmdIntegrationGet(
  config: Vault0Config,
  flags: Record<string, string>,
): { exitCode: number; output: string } {
  const integration = flags.integration
  if (!integration) {
    return {
      exitCode: 1,
      output: JSON.stringify({ error: "--integration is required" }),
    }
  }

  // --block: return raw instruction content for a single block
  const block = flags.block
  if (block) {
    const content = getInstructionContent(block)
    if (content === undefined) {
      return {
        exitCode: 1,
        output: JSON.stringify({ error: `Unknown instruction block: ${block}` }),
      }
    }
    return {
      exitCode: 0,
      output: content,
    }
  }

  const agent = flags.agent
  if (!agent) {
    // Return all agents for this integration
    const intConfig = config.integrations?.[integration]
    if (!intConfig || !intConfig.agents) {
      return {
        exitCode: 0,
        output: JSON.stringify({ instructions: [] } satisfies IntegrationGetResult),
      }
    }

    // Without --agent, return the full agent map
    const result: Record<string, IntegrationGetResult> = {}
    for (const [agentName, agentConfig] of Object.entries(intConfig.agents)) {
      result[agentName] = { instructions: agentConfig.instructions ?? [] }
    }
    return {
      exitCode: 0,
      output: JSON.stringify(result),
    }
  }

  const instructions = getAgentInstructions(config, integration, agent)
  const result: IntegrationGetResult = { instructions }

  return {
    exitCode: 0,
    output: JSON.stringify(result),
  }
}
