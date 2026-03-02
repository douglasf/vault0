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

- `vault0 configure opencode` runs an interactive wizard
- MCP server (`vault0 mcp-serve`) provides tools and resources via stdio
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

### 2. Run the Configuration Wizard

```bash
vault0 configure opencode
```

Or accept defaults without prompts:

```bash
vault0 configure opencode --defaults
```

This will:
- Detect your OpenCode agents
- Configure per-agent instruction blocks
- Add the MCP server entry to OpenCode's config
- Generate the vault0 plugin
- Save integration config to `~/.config/vault0/config.json`

### 3. Verify

```bash
# Check that MCP server starts correctly
vault0 mcp-serve
# (Press Ctrl+C to stop — it should start without errors)

# Preview what was configured
vault0 configure opencode --dry-run
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
      "args": ["mcp-serve"]
    }
  }
}
```

### After: Per-Agent Integration Config

```json
// ~/.config/vault0/config.json
{
  "integrations": {
    "opencode": {
      "agents": {
        "orchestrator": {
          "instructions": ["orchestration-core", "delegation-patterns", "task-discovery"]
        },
        "wolf": {
          "instructions": ["execution-core", "error-handling"]
        },
        "vincent": {
          "instructions": ["investigation-methodology"]
        },
        "architect": {
          "instructions": ["planning-methodology", "task-composition"]
        },
        "git": {
          "instructions": ["git-workflow", "post-commit-approval"]
        }
      }
    }
  }
}
```

## Per-Agent Instruction Injection

The key improvement is that each agent only receives the instruction blocks relevant to its role:

| Agent | Blocks | Why |
|-------|--------|-----|
| Orchestrator | `orchestration-core`, `delegation-patterns`, `task-discovery` | Coordinates task flow, delegates work |
| Executor (Wolf) | `execution-core`, `error-handling` | Implements tasks, handles failures |
| Investigator (Vincent) | `investigation-methodology` | Deep code investigation |
| Planner (Architect) | `planning-methodology`, `task-composition` | Creates plans, decomposes work |
| Git Agent | `git-workflow`, `post-commit-approval` | Commits and auto-approves tasks |

Previously, every agent received every instruction file, bloating context windows with irrelevant content.

## Customizing Instructions

### Override a Block

Create a markdown file at `~/.config/vault0/instructions/<block-name>.md`:

```bash
mkdir -p ~/.config/vault0/instructions
# Override the execution-core block with custom content:
cat > ~/.config/vault0/instructions/execution-core.md << 'EOF'
# Custom Execution Instructions
Your custom instructions here...
EOF
```

The MCP server checks for filesystem overrides before falling back to bundled content.

### Change Agent Assignments

Edit `~/.config/vault0/config.json` directly, or re-run the wizard:

```bash
vault0 configure opencode
```

## Old Plugin Files

The files in the `opencode/` directory of the vault0 repository are **deprecated**:

| Path | Status | Replacement |
|------|--------|-------------|
| `opencode/tools/*.ts` | Deprecated | MCP tools via `vault0 mcp-serve` |
| `opencode/instructions/*.md` | Deprecated | Bundled instruction blocks in `src/lib/instructions/` |
| `opencode/lib/vault0-utils.ts` | Deprecated | Direct DB access in MCP server |
| `opencode/opencode.jsonc` | Deprecated | Generated by `vault0 configure opencode` |

These files remain in the repository for backward compatibility but are no longer the recommended integration path.

## Troubleshooting

### MCP Server Won't Start

```bash
# Check vault0 is in PATH
which vault0

# Test the server directly
vault0 mcp-serve
# Should print to stderr: [vault0-mcp] Starting MCP server for ...
```

### Tools Not Appearing in OpenCode

1. Verify MCP config exists: `cat ~/.config/opencode/config.json`
2. Check for the `mcpServers.vault0` entry
3. Restart OpenCode after configuration changes

### Instructions Not Loading

1. Check integration config: `cat ~/.config/vault0/config.json`
2. Verify the `integrations.opencode.agents` section exists
3. Re-run: `vault0 configure opencode --defaults`
