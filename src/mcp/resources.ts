import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { INSTRUCTION_BLOCKS, getInstructionContent } from "../lib/instructions/content.js"

// ── Resource Registration ───────────────────────────────────────────────

/**
 * Register all instruction blocks as MCP resources on the server.
 * Each block is available at vault0://instructions/<name>.
 */
export function registerInstructionResources(server: McpServer): void {
  for (const name of Object.keys(INSTRUCTION_BLOCKS)) {
    server.resource(
      name,
      `vault0://instructions/${name}`,
      { description: `Vault0 instruction block: ${name}`, mimeType: "text/markdown" },
      () => {
        const content = getInstructionContent(name) ?? ""
        return {
          contents: [
            {
              uri: `vault0://instructions/${name}`,
              text: content,
              mimeType: "text/markdown",
            },
          ],
        }
      },
    )
  }
}
