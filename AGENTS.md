# AGENTS.md — Vault0

Terminal kanban board with dependency tracking, built with Bun + React (OpenTUI) + Drizzle ORM + SQLite.

## Build / Test / Lint Commands

```bash
# Install dependencies
bun install

# Run all tests (Bun built-in test runner, in-memory SQLite)
bun test

# Run a single test file
bun test src/test/queries.test.ts

# Run tests matching a pattern
bun test --grep "createTask"

# Type-check (no emit)
bun run typecheck        # or: tsc --noEmit

# Dev mode with auto-reload
make dev                 # or: bun --watch run src/index.tsx

# Run once
make start               # or: bun run src/index.tsx

# Build standalone binary
make build

# Database migrations
bun run db:generate      # Generate migration from schema changes
bun run db:push          # Push schema directly (dev)
bun run db:studio        # Open Drizzle Studio
```

## Project Structure

```
src/
  components/   PascalCase .tsx files (App.tsx, TaskCard.tsx, Board.tsx)
  hooks/        camelCase .ts files with use- prefix (useBoard.ts, useNavigation.ts)
  lib/          kebab-case .ts utilities (types.ts, constants.ts, theme.ts, dag.ts)
  db/           Database layer (schema.ts, queries.ts, connection.ts)
  cli/          CLI entrypoints and formatters
  test/         Test files: <name>.test.ts (queries.test.ts, dag.test.ts)
  index.tsx     Application entrypoint
drizzle/        Generated migration SQL files
themes/         JSON theme definitions
```

Each major directory has a barrel `index.ts` with named re-exports.

## Code Style

### Formatting

- **2-space indentation** (spaces, not tabs)
- **No semicolons** — the entire codebase omits them
- **Double quotes** for all strings (`"hello"`, not `'hello'`)
- **Trailing commas** on multi-line arrays, objects, parameters, and imports
- **~120 character soft line limit** — no hard enforcement

### Imports

1. **Order**: External packages first, then internal relative imports
2. **`.js` extensions required** on all relative imports (`./schema.js`, `../lib/types.js`)
3. **`node:` prefix** for Node builtins (`"node:fs"`, `"node:path"`)
4. **`import type`** for type-only imports (`import type { Task } from "../lib/types.js"`)
5. **Named imports only** — no default imports (except `React` in the one class component)
6. **No barrel imports** in source files — import directly from the specific module

```typescript
import { useState, useCallback } from "react"
import { eq, and } from "drizzle-orm"
import type { Task, Status } from "../lib/types.js"
import { createTask } from "../db/queries.js"
```

### Naming

| Element | Convention | Examples |
|---------|-----------|----------|
| Functions / variables | camelCase | `createTask`, `getTaskCards`, `isBlocked` |
| Components | PascalCase | `TaskCard`, `Board`, `HelpOverlay` |
| Hooks | camelCase with `use` prefix | `useBoard`, `useNavigation` |
| Types / Interfaces | PascalCase, no prefix | `Task`, `Status`, `TaskCardProps` |
| Constants | UPPER_SNAKE_CASE | `VISIBLE_STATUSES`, `PRIORITY_ORDER` |
| Component files | PascalCase.tsx | `TaskCard.tsx`, `ErrorBoundary.tsx` |
| Hook files | camelCase.ts | `useBoard.ts`, `useTaskActions.ts` |
| Lib / utility files | kebab-case.ts | `db-context.ts`, `session-stats.ts` |
| Test files | kebab-case.test.ts | `queries.test.ts`, `dag.test.ts` |

### Types & Interfaces

- **No `I-` or `T-` prefix** — use plain PascalCase (`TaskCardProps`, not `ITaskCardProps`)
- **String literal unions** over TypeScript `enum`: `type Status = "backlog" | "todo" | ...`
- **Props interfaces**: `<Component>Props` pattern (`TaskCardProps`, `AppProps`)
- **Hook return types**: `Use<Hook>Result` pattern (`UseBoardResult`, `UseNavigationResult`)
- **Shared domain types** live in `src/lib/types.ts`
- **Component-specific types** are co-located at top of the component file

### Exports

- **Named exports only** — no `export default` anywhere in the codebase
- **Barrel re-exports** in each directory's `index.ts` using `export { ... }` and `export type { ... }`
- **`export type`** for type-only re-exports in barrel files

### Error Handling

- **Guard-clause throws** at function top with descriptive messages including entity IDs:
  ```typescript
  if (!task) throw new Error(`Task ${taskId} not found`)
  if (task.archivedAt) throw new Error(`Cannot update archived task: ${taskId}`)
  ```
- **Empty catch with comment** for non-fatal errors:
  ```typescript
  try { unlinkSync(lockPath) } catch { /* already gone */ }
  ```
- **`instanceof Error`** for type narrowing in catch blocks:
  ```typescript
  const message = error instanceof Error ? error.message : String(error)
  ```

### Comments

- **Section dividers**: `// ── Section Title ──────────────────────────`
- **JSDoc `/** */`** on exported functions with `@param` tags for complex signatures
- **Line comments `//`** for inline explanations — explain "why", not "what"
- No `/* */` block comments outside of JSDoc

## Testing Conventions

- **Framework**: Bun's built-in test runner (`bun:test`)
- **Structure**: `describe()` + `test()` — do NOT use `it()`
- **Test names**: Descriptive, behavior-oriented, include expected values in parentheses:
  ```typescript
  test("creates task with correct defaults (status=backlog, priority=normal)", () => {
  ```
- **Setup**: `beforeEach` / `afterEach` with shared `TestDb` fixture from `src/test/helpers.ts`:
  ```typescript
  let testDb: TestDb
  beforeEach(() => { testDb = createTestDb() })
  afterEach(() => { closeTestDb(testDb.sqlite) })
  ```
- **Real databases** — tests use in-memory SQLite with actual migrations. No mocks or stubs.
- **Test location**: All tests in `src/test/` directory

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Language | TypeScript (strict mode, ES2022 target) |
| UI framework | React 19 via @opentui/react (terminal UI) |
| Database | SQLite via bun:sqlite + Drizzle ORM |
| Module system | ESM (`"type": "module"`) |
| ID generation | ULID (via `ulidx`) |
| JSX transform | `@opentui/react` (not standard react-jsx) |

## Key Gotchas

- **`.js` extensions are mandatory** on all relative TypeScript imports — omitting them breaks ESM resolution
- **No formatter or linter config** — all style is convention-based; follow existing patterns
- **Components use `memo()`** for leaf components (e.g., `export const TaskCard = memo(function TaskCard(...) { })`)
- **Synchronous DB access** — Drizzle queries are synchronous (bun:sqlite is sync)
- **Single class component**: `ErrorBoundary.tsx` is the only class component; everything else is functional

## README.md Maintenance

**README.md is the primary source of truth for users and downstream documentation — keep it current.**

When making changes that affect any of the following, update the corresponding README.md sections as part of the same changeset:

- **Features list** — add/remove entries when features are implemented or dropped
- **Usage / CLI commands** — update examples and flags after adding, renaming, or removing commands
- **Keyboard Shortcuts** — reflect any hotkey additions, removals, or rebindings
- **Architecture / Tech Stack** — update when dependencies, runtime, or major architectural patterns change
- **Data Model** — keep schema descriptions in sync with `src/db/schema.ts`
- **Database Migrations** — update instructions if the migration workflow changes

This is a requirement for code agents: if your implementation changes user-facing behavior, CLI surface, or architecture, the README.md update is part of "done".
