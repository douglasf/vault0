# Vault0 — Terminal Kanban Board

A local-first, per-repo terminal UI kanban board with hierarchical tasks, dependency tracking, and SQLite persistence. Designed for developers who live in the terminal.

**Vault0** is named after Fallout lore — Vault 0 is the control center that monitors and controls the entire vault network. This TUI is your control center for task management.

## Features

- **5-Column Kanban Board**: Backlog, To Do, In Progress, In Review, Done
- **Dual Interface**: Interactive TUI and headless CLI (`vault0 task add`, `vault0 task list`, etc.)
- **Dependency Tracking**: Mark tasks as blocked/ready based on upstream dependencies
- **Cycle Detection**: Prevents circular dependencies via DAG reachability checks
- **Hierarchical Tasks**: Create subtasks from the board view (`A`) or detail view
- **Priority & Tags**: Organize with critical/high/normal/low priorities
- **Live Search & Filtering**: Inline text search (`f`), multi-section filter menu (`F`), ready/blocked toggles
- **SQLite Persistence**: Per-repo database at `.vault0/vault0.db` with embedded migrations
- **Keyboard-First**: Vim-inspired navigation, all actions via keyboard
- **Git-Aware Header**: Shows current branch, staged/modified/untracked counts, ahead/behind remote
- **Auto-Refresh**: Watches database file for external changes (e.g., CLI in another terminal)
- **Audit Trail**: Full status history for every task change
- **Terminal-Aware**: Graceful degradation for narrow terminals, resize support
- **Custom Themes**: Bundled Selenized and Solarized theme families with light/dark variants
- **Config File Support**: Global (`~/.config/vault0/config.json`) and per-project (`.vault0/config.json`) configuration with deep merge
- **OpenCode Integration**: CLI supports `opencode` and `opencode-plan` task sources for AI tool integration
- **Releases**: Group completed tasks into named releases, optionally bump version files (package.json, pyproject.toml, Cargo.toml, pom.xml), and browse/restore from a releases archive view

## Installation

### Prerequisites

- **Bun** >= 1.0.0 (or Node 20+)
- **Terminal** >= 80x24 (recommended)

### Install from Source

```bash
git clone <repo-url> vault0
cd vault0
bun install
bun run src/index.tsx
```

### Build & Install (Compiled Binary)

```bash
make install              # builds, signs, and installs to ~/.local/bin
vault0                    # launch from any directory
```

Override the install prefix with `make install PREFIX=/usr/local/bin`.

### OpenCode Integration (Optional)

Vault0 integrates with [OpenCode](https://opencode.ai/) via the **Model Context Protocol (MCP)**. This gives AI agents direct access to vault0's task management tools and composable instruction blocks — no file copying or environment variable overrides required.

#### Quick Setup

```bash
vault0 configure opencode            # Interactive wizard
vault0 configure opencode --defaults # Accept all defaults (no prompts)
vault0 configure opencode --dry-run  # Preview changes without writing
```

This command:
1. Detects your OpenCode agents (from `~/.config/opencode/agent/`)
2. Asks which agents should get vault0 integration (or uses smart defaults)
3. Configures the MCP server in OpenCode's config
4. Generates a plugin that injects per-agent instruction blocks
5. Saves integration config to `~/.config/vault0/config.json`

#### What Gets Configured

| File | Purpose |
|------|---------|
| `~/.config/opencode/config.json` | Adds `vault0` MCP server entry |
| `~/.config/opencode/plugins/vault0.ts` | Plugin that fetches per-agent instructions |
| `~/.config/vault0/config.json` | Stores which instruction blocks each agent receives |

#### How It Works

The MCP server runs as a **stdio subprocess** — OpenCode starts it automatically and manages its lifecycle. The server:

- Opens the repo's `.vault0/vault0.db` directly (no CLI subprocess bridge)
- Exposes 7 task management tools (`vault0-task-list`, `vault0-task-add`, etc.)
- Serves composable instruction blocks as MCP resources (`vault0://instructions/<name>`)
- Supports filesystem overrides via `~/.config/vault0/instructions/<name>.md`

#### Composable Instruction Blocks

Instructions are split into focused, composable blocks organized by **concept/workflow** — not by agent role. Any agent config can compose them based on which vault0 tools the agent has access to:

| Block | Purpose | Tool trigger |
|-------|---------|-------------|
| `tool-reference` | All 7 vault0 tools, valid values, hierarchy rules | Any vault0 tool |
| `task-delegation` | Discovering ready tasks and delegating to other agents | `task-list`, `task-subtasks` |
| `task-execution` | Claiming a task, implementing it, submitting for review | `task-view`, `task-move` |
| `task-planning` | Creating structured plans as vault0 tasks | `task-add` |
| `task-completion` | Marking tasks done after commits | `task-complete` |

Blocks are role-agnostic — the same blocks work whether your agents are named "Orchestrator"/"Executor" or "Build"/"Plan" or a single "Executor" agent with every tool.

#### Manual MCP Configuration

If you prefer manual setup, add this to your OpenCode config:

```json
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

> **Migrating from the old `make opencode` setup?** See [MIGRATION.md](MIGRATION.md) for step-by-step instructions.

## Usage

### TUI (Interactive Board)

```bash
vault0                    # Launch in current directory
vault0 --path DIR         # Launch in specific directory
vault0 --help             # Show help
vault0 --version          # Show version
```

### CLI (Headless Task Management)

```bash
vault0 task add --title "Fix login bug" --priority high --status todo
vault0 task list --status in_progress
vault0 task list --format json
vault0 task view abc12345
vault0 task edit abc12345 --priority critical
vault0 task move abc12345 --status done
vault0 task delete abc12345
vault0 task edit abc12345 --dep-add def67890
vault0 task edit abc12345 --dep-list
vault0 task archive-done
vault0 board list
vault0 task                               # Show available task commands
vault0 task edit --help                   # Show edit command usage
```

The CLI outputs plain text by default. Pass `--format json` for machine-readable output. Task IDs can be shortened — use the last 8+ characters.

### Keyboard Shortcuts

Press `?` inside the app to see a full list

### Data Storage

All data is stored locally in `.vault0/vault0.db` (per repository):

```
.vault0/
  vault0.db          # SQLite database
  vault0.db-wal      # Write-ahead log (WAL mode)
  vault0.db-shm      # Shared memory file
  .gitignore         # Auto-created — prevents .vault0/* from being committed
```

The `.vault0/` directory is automatically git-ignored on creation and is safe to leave in your repository root.

## Architecture

### Technology Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | [@opentui/react](https://opentui.dev/) (React 19 for terminal UIs) |
| Database | SQLite via [Drizzle ORM](https://orm.drizzle.team/) |
| Language | TypeScript (strict mode) |
| Runtime | [Bun](https://bun.sh/) (or Node 20+) |
| ID Generation | [ULID](https://github.com/ulid/spec) (time-sortable unique IDs) |


### Keybinding Architecture

The keybinding system uses a priority-based scope registry. Each component creates a keybinding scope at an appropriate priority level, then registers individual keybindings via hooks. Higher-priority scopes shadow lower-priority ones, and opaque scopes block all key propagation even for unmatched keys.

**Scope priorities:**

| Priority | Level | Use Case |
|----------|-------|----------|
| 0 | ROOT | Global keys that always work (help toggle, quit) |
| 10 | VIEW | Board, detail view, releases view |
| 20 | OVERLAY | Modal dialogs, overlays, forms |
| 30 | WIDGET | Inline pickers, search bars, autocompletes |

**Adding a keybinding to a component:**

```typescript
import { useKeybindScope } from "../hooks/useKeybindScope.js"
import { useKeybind } from "../hooks/useKeybind.js"
import { SCOPE_PRIORITY } from "../lib/keybind-registry.js"

// 1. Create a scope
const scope = useKeybindScope("my-overlay", {
  priority: SCOPE_PRIORITY.OVERLAY,
  opaque: true,  // blocks lower-priority keys even if not handled
})

// 2. Register keybindings
useKeybind(scope, "Escape", onClose, { description: "Close" })
useKeybind(scope, ["k", "ArrowUp"], scrollUp, { description: "Scroll up" })
```

**Key concepts:**
- **Opaque scopes** block all keys from reaching lower-priority scopes, even if the key isn't handled. Use for modals and forms to prevent accidental board actions.
- **`when` flag** on individual bindings allows conditional activation without removing the scope.
- **`active` flag** on scopes deactivates all bindings in the scope (used for sub-mode layering, e.g. detail view deactivates when dependency picker opens).

See `src/lib/keybind-registry.ts` for the registry implementation and `src/lib/keybind-context.ts` for the React provider/context setup.

## Development

### Development Commands

```bash
bun install               # Install dependencies
bun run src/index.tsx      # Launch TUI
bun --watch run src/index.tsx  # Auto-reload on file changes

# Or via Make targets
make start                # Launch TUI
make dev                  # Auto-reload on file changes
make typecheck            # Run TypeScript type checker
make build                # Build standalone binary (no install)
make install              # Build, sign, and install to ~/.local/bin
make uninstall            # Remove from ~/.local/bin
vault0 configure opencode # Configure OpenCode integration (optional)
make clean                # Remove build artifacts

# Database management (via Drizzle Kit)
bun run db:generate       # Generate migration from schema changes
bun run db:migrate        # Run pending migrations
bun run db:push           # Push schema directly to database
bun run db:studio         # Open Drizzle Studio (web-based DB browser)
```

### Running Tests

Vault0 uses Bun's built-in test runner with real in-memory SQLite databases (no mocks):

```bash
bun test                              # Run all tests
bun test src/test/queries.test.ts     # Run a single test file
bun test --grep "createTask"          # Run tests matching a pattern
```

Test files are located in `src/test/` and cover queries, DAG operations, CLI commands, CLI parsing, formatting, migrations, transaction safety, and smoke tests.

### TypeScript

The project uses strict TypeScript with Bun types. To type-check:

```bash
bun run typecheck         # or: make typecheck
```

> **Note**: `schema.ts` produces 2 expected warnings due to Drizzle ORM's self-referential table pattern (tasks.parentId references tasks.id). These are harmless.

## Troubleshooting

### "Permission Denied" Error

The app needs write access to the `.vault0/` directory:

```bash
ls -la .vault0/
chmod 755 .vault0    # Fix permissions if needed
```

### "Database Locked" or Corruption

If the database becomes corrupted or stuck:

```bash
mv .vault0/vault0.db .vault0/vault0.db.backup
vault0  # Relaunch — creates a fresh database
```

### Narrow Terminal

If the UI looks broken on small terminals:
- Resize to at least 80x24 (columns x rows)
- Below 80 columns, the app automatically switches to a single-column degraded view

### Error Log

Runtime errors are logged to `.vault0/error.log` for debugging.

## License

MIT

## Acknowledgments

- Built with [@opentui/react](https://opentui.dev/) (React 19 for terminal UIs), [Drizzle ORM](https://orm.drizzle.team/), and SQLite
- Named after [Vault 0](https://fallout.fandom.com/wiki/Vault_0) from the Fallout universe

---

**Version**: 0.1.0 (Alpha) — Core functionality complete.
Press `?` in the app for help, or check the source code structure above.
