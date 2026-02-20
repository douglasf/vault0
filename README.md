# Vault0 — Terminal Kanban Board

A local-first, per-repo terminal UI kanban board with hierarchical tasks, dependency tracking, and SQLite persistence. Designed for developers who live in the terminal.

**Vault0** is named after Fallout lore — Vault 0 is the control center that monitors and controls the entire vault network. This TUI is your control center for task management.

## Features

- **5-Column Kanban Board**: Backlog, To Do, In Progress, In Review, Done
- **Dependency Tracking**: Mark tasks as blocked/ready based on upstream dependencies
- **Cycle Detection**: Prevents circular dependencies via DAG reachability checks
- **Hierarchical Tasks**: Create subtasks and track completion progress
- **Priority & Tags**: Organize with critical/high/normal/low priorities
- **Filtering & Search**: Filter by status, priority, source, ready/blocked state
- **SQLite Persistence**: Per-repo database at `.vault0/vault0.db`
- **Keyboard-First**: Vim-inspired navigation, all actions via keyboard
- **Audit Trail**: Full status history for every task change
- **Terminal-Aware**: Graceful degradation for narrow terminals, resize support

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

### Install Globally (when packaged)

```bash
bun install --global vault0
vault0                    # launches in current directory
vault0 --path ~/myproject # launches for specific directory
```

## Usage

### Launching

```bash
vault0                    # Launch in current directory
vault0 --path DIR         # Launch in specific directory
vault0 --help             # Show help
vault0 --version          # Show version
```

### Keyboard Shortcuts

Press `?` inside the app to see a full list. Quick reference:

| Key | Action |
|-----|--------|
| `Left`/`Right` | Move between columns |
| `Up`/`Down` | Move between tasks within column |
| `Enter` | Open task detail view |
| `a` | Create new task |
| `s` | Change task status |
| `p` | Cycle priority: normal -> high -> critical -> low |
| `d` | Archive (soft-delete) task |
| `e` | Edit task title/description |
| `+` / `-` | Add/remove dependencies (in detail view) |
| `f` | Open filter menu |
| `r` | Toggle "ready only" filter |
| `b` | Toggle "blocked only" filter |
| `?` | Show help |
| `q` | Quit |

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
    index.tsx                # CLI entry point (arg parsing, DB init, render)
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
      HelpOverlay.tsx        # Paginated keyboard shortcut reference
      ErrorBoundary.tsx      # React error boundary for graceful failures
      EmptyBoard.tsx         # Empty state with onboarding hint
      NarrowTerminal.tsx     # Single-column fallback for <80-col terminals
      Header.tsx             # Top bar with board info & active filters
      index.ts               # Barrel export
    db/
      schema.ts              # Drizzle ORM schema (boards, tasks, deps, history)
      connection.ts          # SQLite init with WAL mode & optimal PRAGMAs
      queries.ts             # All query helpers & mutation functions
      seed.ts                # Default board seeding on first launch
      index.ts               # Barrel export
    hooks/
      useBoard.ts            # Board data fetching with filter application
      useNavigation.ts       # 2D grid keyboard navigation state
      useTaskActions.ts      # Task CRUD mutations (create, update, delete)
      useFilters.ts          # Filter state management & counting
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
  package.json
  tsconfig.json
  drizzle.config.ts
```

### Data Model

**Boards** — Containers for tasks. Currently single board per repo (multi-board planned for v1.1).

**Tasks** — Items with status, priority, description, and metadata:
- **Status**: backlog | todo | in_progress | in_review | done | cancelled
- **Priority**: critical | high | normal | low
- **Source**: manual | todo_md | plan | import
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

## Development

### Development Commands

```bash
bun install               # Install dependencies
bun run src/index.tsx      # Launch TUI
bun --watch run src/index.tsx  # Auto-reload on file changes

# Database management (via Drizzle Kit)
npm run db:generate       # Generate migration from schema changes
npm run db:migrate        # Run pending migrations
npm run db:push           # Push schema directly to database
npm run db:studio         # Open Drizzle Studio (web-based DB browser)
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
npm run typecheck
```

> **Note**: `schema.ts` produces 2 expected warnings due to Drizzle ORM's self-referential table pattern (tasks.parentId references tasks.id). These are harmless.

### Building a Standalone Binary

No build step is normally required — Bun loads TypeScript directly. For distribution as a single binary:

```bash
bun build --compile src/index.tsx --outfile vault0
```

## Future Plans

### v1.1 (Near-term)

- [ ] Multi-board support (switch between boards)
- [ ] Subtask creation from board view (`A` shortcut)
- [ ] Tag autocomplete in task form
- [ ] Quick search by title (`/` shortcut)
- [ ] Task templates (e.g., "Bug Report" template)

### v2.0 (Medium-term)

- [ ] FTS5 full-text search for fast querying
- [ ] Import/export (JSON, Markdown, CSV)
- [ ] Undo/redo functionality
- [ ] Mouse support & drag-drop
- [ ] Custom themes & color configuration
- [ ] Automated test suite (Vitest)
- [ ] Config file support (`vault0.config.json`)

### v3.0 (Long-term)

- [ ] OpenCode integration (programmatic CRUD via tools)
- [ ] Cloud sync (Turso/libSQL backend)
- [ ] Real-time collaboration
- [ ] Web UI companion (read-only or synced)
- [ ] AI integration (auto-prioritization, smart suggestions)

## Known Limitations

- **Single Board**: Only one board per repo in v1 (multi-board planned)
- **No Mouse Support**: Keyboard-first design in v1
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
