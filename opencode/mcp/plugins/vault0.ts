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
  return {
    event: async ({ event }: any) => {
      if (event.type !== "session.created") return
      
      // Log the ENTIRE event structure to see what properties exist
      await client.app.log({
        body: {
          service: "vault0-plugin",
          level: "info",
          message: `Full event.type=${event.type} keys=${Object.keys(event).join(", ")}`,
        },
      })

      // Dump the full event.properties object to see its structure
      if (event.properties) {
        const dump = JSON.stringify(event.properties, null, 2)
        // Split into chunks if too large for a single log line
        const lines = dump.split("\n")
        const chunkSize = 20
        for (let i = 0; i < lines.length; i += chunkSize) {
          const chunk = lines.slice(i, i + chunkSize).join("\n")
          await client.app.log({
            body: {
              service: "vault0-plugin",
              level: "info",
              message: `event.properties [${i}-${Math.min(i + chunkSize, lines.length)}]:\n${chunk}`,
            },
          })
        }
      } else {
        await client.app.log({
          body: {
            service: "vault0-plugin",
            level: "warn",
            message: "event.properties is undefined/null",
          },
        })
      }

      const agentName = event.agent?.name || event.session?.agent?.name

      if (!agentName) {
        await client.app.log({
          body: {
            service: "vault0-plugin",
            level: "warn",
            message: "Could not find agent name in event",
          },
        })
        return
      }

      await client.app.log({
        body: {
          service: "vault0-plugin",
          level: "info",
          message: `Found agent: ${agentName}`,
        },
      })

      const blockNames = await fetchAgentInstructions(agentName)
      
      if (blockNames.length === 0) {
        await client.app.log({
          body: {
            service: "vault0-plugin",
            level: "info",
            message: `No instruction blocks configured for ${agentName}`,
          },
        })
        return
      }

      await client.app.log({
        body: {
          service: "vault0-plugin",
          level: "info",
          message: `Fetching ${blockNames.length} blocks: ${blockNames.join(", ")}`,
        },
      })

      const contents = await Promise.all(
        blockNames.map((name) => fetchInstructionContent(client, name)),
      )

      const combined = contents.filter(Boolean).join("\n\n")
      if (combined) {
        await client.app.log({
          body: {
            service: "vault0-plugin",
            level: "info",
            message: `Injecting ${combined.length} chars into systemPrompt`,
          },
        })
        // Inject into system prompt
        if (event.systemPrompt) {
          event.systemPrompt = [event.systemPrompt, combined]
            .filter(Boolean)
            .join("\n\n")
        } else {
          event.systemPrompt = combined
        }
      }
    },
  }
}
