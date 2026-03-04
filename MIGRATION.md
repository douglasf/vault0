# Migration Guide: Plugin-Based → MCP-Based OpenCode Integration

This guide covers migrating from the old `make opencode` / `OPENCODE_CONFIG_DIR` setup to the new MCP server-based integration.

## What Changed

### Before (v0.1.x — Plugin-Based)

- `make opencode` copied the `opencode/` directory to `~/.config/vault0/opencode`
- `OPENCODE_CONFIG_DIR` environment variable pointed OpenCode to vault0's config
- **All agents received all instructions** — no per-agent filtering
- Tools were implemented as standalone TypeScript files in `opencode/tools/`
- Instructions were static markdown files in `opencode/instructions/`

### After (v0.2.x — MCP-Based)

- `vault0 mcp init` generates the MCP server configuration
- MCP server (`vault0 mcp serve`) provides tools and resources via stdio
- **Per-agent instruction injection** — each agent gets only relevant blocks
- Tools use Direct DB Access (no CLI subprocess bridge)
- Instructions are composable, overridable blocks served as MCP resources

### Why

| Concern | Before | After |
|---------|--------|-------|
| **Performance** | Each tool call spawned a `vault0` CLI subprocess | Direct in-process SQLite access |
| **Instruction bloat** | Every agent got every instruction file | Per-agent blocks keep context focused |
| **Flexibility** | Edit files manually to customize | Config-driven with filesystem overrides |
| **Setup** | Manual env var, overrode existing OpenCode config | One command, merges into existing config |
| **Lifecycle** | Tools ran independently | MCP server managed by OpenCode automatically |

## Migration Steps

### 1. Remove Old Setup

```bash
# Remove the environment variable from your shell config
# Edit ~/.zshrc or ~/.bashrc and remove:
#   export OPENCODE_CONFIG_DIR=~/.config/vault0/opencode

# Optional: remove old config directory
rm -rf ~/.config/vault0/opencode
```

### 2. Set Up MCP Integration

```bash
vault0 mcp init
```

This generates the MCP server configuration to add to your OpenCode config.

For advanced per-agent tool permissions, see `opencode/reference-config.jsonc` in the vault0 repository.

### 3. Verify

```bash
# Check that MCP server starts correctly
vault0 mcp serve
# (Press Ctrl+C to stop — it should start without errors)
```

### 4. Restart OpenCode

Restart your OpenCode session. The MCP server will start automatically when OpenCode launches.

## Configuration Comparison

### Before: Environment Variable

```bash
# ~/.zshrc
export OPENCODE_CONFIG_DIR=~/.config/vault0/opencode
```

### After: MCP Server Entry

```json
// ~/.config/opencode/config.json
{
  "mcpServers": {
    "vault0": {
      "type": "stdio",
      "command": "vault0",
      "args": ["mcp", "serve"]
    }
  }
}
```

## Deprecated / Removed Files

| Path | Status | Replacement |
|------|--------|-------------|
| `opencode/direct/` | **Removed** | MCP tools via `vault0 mcp serve` |
| `opencode/mcp/opencode.jsonc` | **Moved** | `opencode/reference-config.jsonc` |
| `opencode/tools/*.ts` | Removed | MCP tools via `vault0 mcp serve` |
| `opencode/instructions/*.md` | Removed | Bundled instruction blocks in `src/lib/instructions/` |
| `opencode/lib/vault0-utils.ts` | Removed | Direct DB access in MCP server |

## Troubleshooting

### MCP Server Won't Start

```bash
# Check vault0 is in PATH
which vault0

# Test the server directly
vault0 mcp serve
# Should print to stderr: [vault0-mcp] Starting MCP server for ...
```

### Tools Not Appearing in OpenCode

1. Verify MCP config exists: `cat ~/.config/opencode/config.json`
2. Check for the `mcpServers.vault0` entry
3. Restart OpenCode after configuration changes
