/**
 * Vault0 OpenCode Plugin
 */

interface IntegrationGetResult {
  instructions: string[]
}

async function fetchAgentInstructions(agentName: string): Promise<string[]> {
  try {
    const proc = Bun.spawn(
      ["vault0", "integration", "get", "--integration=opencode", `--agent=${agentName}`],
      { stdout: "pipe", stderr: "pipe" },
    )
    const text = await new Response(proc.stdout).text()
    const code = await proc.exited
    if (code !== 0) return []
    const result: IntegrationGetResult = JSON.parse(text)
    return result.instructions ?? []
  } catch {
    return []
  }
}

async function fetchInstructionContent(
  client: any,
  name: string,
): Promise<string> {
  try {
    const proc = Bun.spawn(
      ["vault0", "integration", "get", "--integration=opencode", `--block=${name}`],
      { stdout: "pipe", stderr: "pipe" },
    )
    const text = await new Response(proc.stdout).text()
    const code = await proc.exited
    if (code !== 0) return ""
    return text.trim()
  } catch {
    return ""
  }
}

export const Vault0Plugin = async ({ client }: any) => {
  const injectedSessions = new Set<string>()
  const sessionAgentCache = new Map<string, string>()
  const instructionCache = new Map<string, string>()

  return {
    "chat.message": async (input: any, _output: any) => {
      if (input.sessionID && input.agent) {
        sessionAgentCache.set(input.sessionID, input.agent)
      }
    },

    "experimental.chat.system.transform": async (input: any, output: any) => {
      const sessionID = input.sessionID
      if (!sessionID) return

      // Already injected for this session? Skip.
      if (injectedSessions.has(sessionID)) return

      const agentName = sessionAgentCache.get(sessionID)
      if (!agentName) return

      // Fetch and inject (reuse instruction cache across agents)
      let combined = instructionCache.get(agentName)
      if (combined === undefined) {
        const blockNames = await fetchAgentInstructions(agentName)
        if (blockNames.length === 0) {
          instructionCache.set(agentName, "")
          injectedSessions.add(sessionID)
          return
        }

        const contents = await Promise.all(
          blockNames.map((name) => fetchInstructionContent(client, name)),
        )
        combined = contents.filter(Boolean).join("\n\n")
        instructionCache.set(agentName, combined)
      }

      injectedSessions.add(sessionID)

      if (combined) {
        output.system.push(combined)
      }
    },

    "experimental.session.compacting": async (input: any, _output: any) => {
      if (input.sessionID) {
        injectedSessions.delete(input.sessionID)
      }
    },
  }
}
