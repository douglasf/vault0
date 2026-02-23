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
- **OpenCode Integration**: CLI supports `opencode` and `opencode-plan` task sources for AI tool integration

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
vault0 task complete abc12345
vault0 task delete abc12345
vault0 task dep add abc12345 --on def67890
vault0 task dep list abc12345
vault0 task archive-done
vault0 board list
vault0 task help                          # Full CLI reference
```

The CLI outputs plain text by default. Pass `--format json` for machine-readable output. Task IDs can be shortened — use the last 8+ characters.

### Keyboard Shortcuts

Press `?` inside the app to see a full list. Quick reference:

| Key | Action |
|-----|--------|
| `←`/`→` | Move between columns |
| `↑`/`↓` | Move between tasks within column |
| `<`/`>` | Move task to previous/next lane |
| `Enter` | Open task detail view |
| `Esc` | Return to board view |
| `a` | Create new task |
| `A` | Create subtask under selected task |
| `s` | Change task status |
| `p` | Cycle priority: normal → high → critical → low |
| `d` | Delete task (archive, or permanent if already archived) |
| `D` | Archive all tasks in Done lane |
| `e` | Edit task title/description |
| `+` / `-` | Add/remove dependencies (in detail view) |
| `f` | Search tasks by title / description (live filter) |
| `F` | Open filter menu (status, priority, source) |
| `r` | Toggle "ready only" filter |
| `b` | Toggle "blocked only" filter |
| `?` | Show help |
| `q` | Quit |
| `Ctrl+C` | Emergency exit |

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
| UI Framework | [Ink](https://github.com/vadimdemedes/ink) v6 (React for CLIs) |
| Database | SQLite via [Drizzle ORM](https://orm.drizzle.team/) |
| Language | TypeScript (strict mode) |
| Runtime | [Bun](https://bun.sh/) (or Node 20+) |
| ID Generation | [ULID](https://github.com/ulid/spec) (time-sortable unique IDs) |

### Project Structure

```
vault0/
  src/
    index.tsx                # Entry point (CLI routing, DB init, TUI render)
    cli/
      index.ts               # CLI argument parser & command router
      commands.ts            # Command handlers (add, list, view, edit, move, etc.)
      format.ts              # Text & JSON output formatters
    components/
      App.tsx                # Root component — mode routing & global keys
      Board.tsx              # 5-column kanban board layout
      Column.tsx             # Single column with scroll & task cards
      TaskCard.tsx           # Compact task card (priority, deps, subtasks)
      TaskDetail.tsx         # Full task detail view with scrolling
      TaskForm.tsx           # Create/edit form with field navigation
      StatusPicker.tsx       # Status transition selector
      DependencyPicker.tsx   # Add dependency with search filtering
      FilterBar.tsx          # Multi-section filter menu
      TextFilterBar.tsx      # Inline live text search bar
      HelpOverlay.tsx        # Paginated keyboard shortcut reference
      ConfirmDelete.tsx      # Delete confirmation dialog
      ConfirmArchiveDone.tsx # Archive-done-lane confirmation dialog
      ErrorBoundary.tsx      # React error boundary for graceful failures
      EmptyBoard.tsx         # Empty state with onboarding hint
      NarrowTerminal.tsx     # Single-column fallback for <80-col terminals
      Header.tsx             # Top bar with git status, board info & filters
      index.ts               # Barrel export
    db/
      schema.ts              # Drizzle ORM schema (boards, tasks, deps, history)
      connection.ts          # SQLite init with WAL mode & optimal PRAGMAs
      queries.ts             # All query helpers & mutation functions
      migrations.ts          # Embedded SQL migrations (works in compiled binary)
      seed.ts                # Default board seeding on first launch
      index.ts               # Barrel export
    hooks/
      useBoard.ts            # Board data fetching with filter application
      useNavigation.ts       # 2D grid keyboard navigation state
      useTaskActions.ts      # Task CRUD mutations (create, update, delete)
      useFilters.ts          # Filter state management & counting
      useDbWatcher.ts        # SQLite file watcher for auto-refresh on external changes
      useTextInput.ts        # Controlled text input with cursor management
      useGitStatus.ts        # Git branch & working tree status polling
      index.ts               # Barrel export
    lib/
      types.ts               # TypeScript types (inferred from Drizzle schema)
      constants.ts           # Status/priority labels, visible statuses
      theme.ts               # Color definitions for priorities & statuses
      db-context.ts          # React context for database access
      dag.ts                 # Dependency graph: cycle detection, topo sort
      index.ts               # Barrel export
    test-db.ts               # Manual database setup test
    test-queries.ts          # Manual query & DAG operation tests
  drizzle/                   # Generated SQL migrations
  Makefile                   # Build, install, dev commands
  package.json
  tsconfig.json
  drizzle.config.ts
```

### Data Model

**Boards** — Containers for tasks. Currently single board per repo (multi-board planned).

**Tasks** — Items with status, priority, description, and metadata:
- **Status**: backlog | todo | in_progress | in_review | done | cancelled
  > **Note:** Cancelled tasks are hidden from the TUI board (which uses a 5-column kanban layout). To view or filter cancelled tasks, use the CLI: `vault0 task list --status cancelled`.
- **Priority**: critical | high | normal | low
- **Source**: manual | todo_md | opencode | opencode-plan | import
- **Hierarchy**: Tasks can have subtasks via `parentId`

**Dependencies** — Directed acyclic graph (DAG) of task relationships:
- Prevents cycles with DFS reachability checking before every insert
- Computes "ready" (all deps done) and "blocked" (any dep incomplete) states
- Supports transitive dependency/dependent queries

**Status History** — Immutable audit trail of every status transition, with timestamps.

### Key Design Decisions

- **Synchronous SQLite** — All DB operations are sync (Bun's `bun:sqlite`). No async state management complexity. React re-renders trigger fresh queries.
- **No caching layer** — The DB is local and fast. Queries run on every render for simplicity and guaranteed freshness.
- **WAL mode** — Write-Ahead Logging for concurrent read safety and durability.
- **Soft deletes** — Tasks are archived (set `archivedAt`), never hard-deleted. Cascade to subtasks.
- **ULID primary keys** — Time-sortable, globally unique, no sequence conflicts.
- **Embedded migrations** — SQL migrations are compiled into the source so they work in both dev mode and standalone binaries.

### Database Migrations

Vault0 uses a **custom embedded migration runner** instead of Drizzle's default filesystem-based migrator. This is necessary because compiled Bun binaries (`bun build --compile`) cannot read migration SQL files from disk at runtime — all code must be self-contained.

#### How It Works

- Migration SQL is stored as string literals in `src/db/migrations.ts` (the `MIGRATIONS` array).
- Each migration is hashed (SHA-256) and tracked in the `__drizzle_migrations` table — the same table Drizzle's filesystem migrator uses, so the two are **fully compatible**. Migrations applied by either runner are recognized by the other.
- Migrations are split on Drizzle's `statement-breakpoint` markers and executed statement-by-statement.
- An "already exists" safety net catches duplicate DDL errors gracefully, making re-runs idempotent even if hash mismatches occur (e.g., transitioning between migration runners).

#### Adding a New Migration

1. **Modify the schema** in `src/db/schema.ts`
2. **Generate SQL** — run `bun run db:generate` to create the migration file in `drizzle/`
3. **Embed the SQL** — copy the generated SQL content into a new entry in the `MIGRATIONS` array in `src/db/migrations.ts`
4. **Rebuild** — run `make install` to compile the updated binary

#### Conventions

- Migration tags follow Drizzle's naming pattern: `0000_name`, `0001_name`, etc.
- Use `IF NOT EXISTS` in DDL statements for safety.
- Multi-statement migrations use Drizzle's `--> statement-breakpoint` delimiter.

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
make clean                # Remove build artifacts

# Database management (via Drizzle Kit)
bun run db:generate       # Generate migration from schema changes
bun run db:migrate        # Run pending migrations
bun run db:push           # Push schema directly to database
bun run db:studio         # Open Drizzle Studio (web-based DB browser)
```

### Running Tests

Manual test scripts are included for verifying database and query operations:

```bash
bun src/test-db.ts        # Test database setup, CRUD, and migrations
bun src/test-queries.ts   # Test all query helpers, DAG ops, and edge cases
```

### TypeScript

The project uses strict TypeScript with Bun types. To type-check:

```bash
bun run typecheck         # or: make typecheck
```

> **Note**: `schema.ts` produces 2 expected warnings due to Drizzle ORM's self-referential table pattern (tasks.parentId references tasks.id). These are harmless.

### Building a Standalone Binary

No build step is normally required — Bun loads TypeScript directly. For distribution as a single binary:

```bash
make build                # builds and signs the binary as ./vault0
make install              # builds, signs, and installs to ~/.local/bin
```

Or manually:

```bash
bun build --compile src/index.tsx --outfile vault0
codesign --sign - --force vault0    # required on macOS/Apple Silicon
```

## Future Plans

### Near-term

- [ ] Multi-board support (switch between boards)
- [ ] Tag autocomplete in task form
- [ ] Task templates (e.g., "Bug Report" template)

### Medium-term

- [ ] FTS5 full-text search for fast querying
- [ ] Import/export (JSON, Markdown, CSV)
- [ ] Undo/redo functionality
- [ ] Mouse support & drag-drop
- [ ] Custom themes & color configuration
- [ ] Automated test suite (Vitest)
- [ ] Config file support (`vault0.config.json`)

### Long-term

- [ ] Cloud sync (Turso/libSQL backend)
- [ ] Real-time collaboration
- [ ] Web UI companion (read-only or synced)
- [ ] AI integration (auto-prioritization, smart suggestions)

## Known Limitations

- **Single Board**: Only one board per repo currently (multi-board planned)
- **No Mouse Support**: Keyboard-first design
- **No Custom Themes**: Single default color scheme
- **Self-Referential Schema Warning**: TypeScript reports 2 harmless warnings in `schema.ts` (Drizzle ORM limitation with self-referencing foreign keys)

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

- Built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs), [Drizzle ORM](https://orm.drizzle.team/), and SQLite
- Named after [Vault 0](https://fallout.fandom.com/wiki/Vault_0) from the Fallout universe

---

**Version**: 0.1.0 (Alpha) — Core functionality complete.
Press `?` in the app for help, or check the source code structure above.
