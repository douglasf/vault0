# Vault0 MCP Server Architecture

This document describes the architecture of vault0's MCP (Model Context Protocol) server and its integration with AI coding assistants like OpenCode.

## Overview

Vault0 exposes its task management capabilities through an MCP server that communicates via **stdio transport**. The host application (e.g., OpenCode) spawns `vault0 mcp-serve` as a subprocess and communicates over stdin/stdout using JSON-RPC.

```
┌──────────────────────┐     stdio (JSON-RPC)     ┌──────────────────────┐
│     OpenCode         │◄────────────────────────►│   vault0 mcp-serve   │
│  (MCP Client)        │                           │   (MCP Server)       │
│                      │                           │                      │
│  ┌────────────────┐  │                           │  ┌────────────────┐  │
│  │ Agent          │  │   tool calls / resources  │  │ Tools          │  │
│  │ (orchestrator, │──┼──────────────────────────►│  │ (7 task mgmt)  │  │
│  │  wolf, etc.)   │  │                           │  ├────────────────┤  │
│  └────────────────┘  │                           │  │ Resources      │  │
│                      │                           │  │ (instructions) │  │
│  ┌────────────────┐  │                           │  ├────────────────┤  │
│  │ Plugin         │  │   instruction injection   │  │ SQLite DB      │  │
│  │ (vault0.ts)    │──┼──────────────────────────►│  │ (.vault0/)     │  │
│  └────────────────┘  │                           │  └────────────────┘  │
└──────────────────────┘                           └──────────────────────┘
```

## Design Decisions

### Direct DB Access (No CLI Bridge)

The MCP server opens the repo's SQLite database directly via `bun:sqlite`, sharing the same query layer (`src/db/queries.ts`) as the CLI and TUI. This eliminates the overhead of spawning CLI subprocesses for each tool call.

**Why not subprocess?**
- Each tool call would spawn `vault0 task ...`, parse JSON output, and return it — adding ~50-100ms latency per call
- Agent workflows often make 5-10 tool calls in sequence; latency compounds
- Direct access means synchronous, in-process queries with sub-millisecond response times

### Stdio Transport

The server uses MCP's stdio transport rather than HTTP/SSE:

- **Automatic lifecycle**: OpenCode starts/stops the server with its own process
- **No port management**: No port conflicts, no daemon to manage
- **Security**: No network exposure — communication stays on local pipes
- **Simplicity**: No TLS, no auth tokens, no service discovery

### Console Redirection

All `console.*` output is redirected to stderr. Stdout is reserved exclusively for JSON-RPC protocol messages. This prevents any logging from corrupting the MCP message stream.

## Components

### MCP Server (`src/mcp/server.ts`)

Entry point. Responsibilities:
- Initialize database (open, migrate, seed)
- Start periodic WAL checkpoints (every 5 minutes)
- Register tools and resources
- Connect stdio transport
- Handle graceful shutdown (checkpoint + close DB)

### Tools (`src/mcp/tools.ts`)

Seven task management tools registered on the MCP server:

| Tool | Description |
|------|-------------|
| `vault0-task-list` | Query tasks with filters (status, priority, search, blocked, ready) |
| `vault0-task-add` | Create new tasks |
| `vault0-task-view` | Get full task details by ID |
| `vault0-task-move` | Change task status (not to `done`) |
| `vault0-task-complete` | Move task to `done` (git agent only) |
| `vault0-task-update` | Edit task metadata and dependencies |
| `vault0-task-subtasks` | List subtasks with optional ready filter |

Each tool wraps the same `cmd*` functions used by the CLI, converting `CommandResult` to MCP response format with error handling.

### Resources (`src/mcp/resources.ts`)

Instruction blocks are served as MCP resources at `vault0://instructions/<name>`. The resource handler:

1. Checks for a filesystem override at `~/.config/vault0/instructions/<name>.md`
2. Falls back to the bundled TypeScript constant from `src/lib/instructions/`

This allows users to customize instruction content without modifying vault0's source.

### Instruction Blocks (`src/lib/instructions/`)

Five composable instruction blocks, each a TypeScript file exporting a string constant. Blocks are granular by **concept/workflow**, not by agent role — any agent config can compose them based on which tools the agent has:

```
src/lib/instructions/
  tool-reference.ts    — All 7 vault0 tools, valid values, hierarchy rules
  task-delegation.ts   — Discovering ready tasks and delegating to other agents
  task-execution.ts    — Claiming a task, implementing it, submitting for review
  task-planning.ts     — Creating structured plans as vault0 tasks
  task-completion.ts   — Marking tasks done after commits (vault0_task-complete)
  index.ts             — Barrel exports
```

## Instruction Composition

### Per-Agent Injection

The integration config (`~/.config/vault0/config.json`) maps each agent to its instruction blocks:

```json
{
  "integrations": {
    "opencode": {
      "agents": {
        "orchestrator": { "instructions": ["tool-reference", "task-delegation"] },
        "wolf": { "instructions": ["tool-reference", "task-execution"] }
      }
    }
  }
}
```

The OpenCode plugin reads this config, queries the vault0 CLI for the agent's assigned blocks, fetches the content for each block, and appends it to the agent's system prompt.

### Override Chain

```
Filesystem override (~/.config/vault0/instructions/<name>.md)
    ↓ (if not found)
Bundled constant (src/lib/instructions/<name>.ts)
```

This lets users customize instructions without forking vault0 or editing generated files.

## Multi-Repo Isolation

Each repository has its own `.vault0/vault0.db`. When the MCP server starts, it receives the repo root path and opens that specific database. Multiple OpenCode sessions in different repos each get their own MCP server instance with an isolated database.

```
~/project-a/.vault0/vault0.db  ←  MCP server instance 1
~/project-b/.vault0/vault0.db  ←  MCP server instance 2
```

The global config (`~/.config/vault0/config.json`) is shared across repos, but per-project overrides (`.vault0/config.json`) can customize behavior per repo.

## Configuration Flow

```
vault0 configure opencode
    │
    ├─ Detect agents (scan ~/.config/opencode/agent/)
    ├─ Interactive wizard (or --defaults)
    ├─ Write MCP server entry → ~/.config/opencode/config.json
    ├─ Generate plugin → ~/.config/opencode/plugins/vault0.ts
    └─ Save integration config → ~/.config/vault0/config.json
```

## WAL Management

The MCP server runs periodic WAL checkpoints (passive, every 5 minutes) to prevent the WAL file from growing unbounded during long sessions. On shutdown, a truncating checkpoint compacts the WAL completely.
