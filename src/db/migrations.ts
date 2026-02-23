import { createHash } from "node:crypto"
import type { Database } from "bun:sqlite"

// ── Embedded Migrations ─────────────────────────────────────────────
//
// Migration SQL is embedded directly in the source code so it works in
// both dev mode (bun run) and compiled binaries (bun build --compile).
//
// When adding a new migration:
//   1. Run `bun run db:generate` to create the SQL file in drizzle/
//   2. Copy the SQL content into a new entry in MIGRATIONS below
//   3. Rebuild: `make install`

interface EmbeddedMigration {
  tag: string
  sql: string
}

const MIGRATIONS: EmbeddedMigration[] = [
  {
    tag: "0000_broad_gabe_jones",
    // NOTE: Uses IF NOT EXISTS for idempotency. This handles the transition
    // from drizzle's filesystem-based migrator (which stores different hashes)
    // to embedded migrations. Without IF NOT EXISTS, existing databases would
    // crash with "table already exists" due to hash mismatch.
    sql: `CREATE TABLE IF NOT EXISTS \`boards\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`name\` text NOT NULL,
\t\`description\` text,
\t\`created_at\` integer NOT NULL,
\t\`updated_at\` integer NOT NULL,
\t\`archived_at\` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`task_dependencies\` (
\t\`task_id\` text NOT NULL,
\t\`depends_on\` text NOT NULL,
\t\`created_at\` integer NOT NULL,
\tPRIMARY KEY(\`task_id\`, \`depends_on\`),
\tFOREIGN KEY (\`task_id\`) REFERENCES \`tasks\`(\`id\`) ON UPDATE no action ON DELETE no action,
\tFOREIGN KEY (\`depends_on\`) REFERENCES \`tasks\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`task_status_history\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`task_id\` text NOT NULL,
\t\`from_status\` text,
\t\`to_status\` text NOT NULL,
\t\`changed_at\` integer NOT NULL,
\tFOREIGN KEY (\`task_id\`) REFERENCES \`tasks\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_status_history_task\` ON \`task_status_history\` (\`task_id\`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_status_history_changed\` ON \`task_status_history\` (\`changed_at\`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`tasks\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`board_id\` text NOT NULL,
\t\`parent_id\` text,
\t\`title\` text NOT NULL,
\t\`description\` text,
\t\`status\` text DEFAULT 'backlog' NOT NULL,
\t\`priority\` text DEFAULT 'normal' NOT NULL,
\t\`source\` text DEFAULT 'manual' NOT NULL,
\t\`source_ref\` text,
\t\`tags\` text DEFAULT '[]',
\t\`sort_order\` integer DEFAULT 0 NOT NULL,
\t\`created_at\` integer NOT NULL,
\t\`updated_at\` integer NOT NULL,
\t\`archived_at\` integer,
\tFOREIGN KEY (\`board_id\`) REFERENCES \`boards\`(\`id\`) ON UPDATE no action ON DELETE no action,
\tFOREIGN KEY (\`parent_id\`) REFERENCES \`tasks\`(\`id\`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_tasks_board_status\` ON \`tasks\` (\`board_id\`,\`status\`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_tasks_parent\` ON \`tasks\` (\`parent_id\`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_tasks_priority\` ON \`tasks\` (\`priority\`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_tasks_source\` ON \`tasks\` (\`source\`);`,
  },
  {
    tag: "0001_update_source_enum",
    sql: `-- Migrate existing "plan" source values to "opencode-plan"
-- The "opencode" and "opencode-plan" sources replace the old "plan" source.
-- "opencode" = tasks created directly by OpenCode
-- "opencode-plan" = tasks created from OpenCode plan files
UPDATE \`tasks\` SET \`source\` = 'opencode-plan' WHERE \`source\` = 'plan';`,
  },
  {
    tag: "0002_add_task_type",
    sql: `-- Add task type column (feature, bug, analysis). Nullable — existing tasks have no type.
ALTER TABLE \`tasks\` ADD COLUMN \`type\` text;`,
  },
]

// ── Migration Runner ────────────────────────────────────────────────
//
// Compatible with drizzle-orm's __drizzle_migrations table so that
// migrations applied by drizzle's filesystem-based migrator (dev mode)
// are recognized, and vice versa.

export function runEmbeddedMigrations(sqlite: Database) {
  // Create migrations tracking table (matches drizzle-orm schema)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at INTEGER
    )
  `)

  // Get already-applied migration hashes
  const rows = sqlite.prepare('SELECT hash FROM "__drizzle_migrations"').all() as { hash: string }[]
  const applied = new Set(rows.map((r) => r.hash))

  // Run pending migrations in order
  for (const migration of MIGRATIONS) {
    const hash = createHash("sha256").update(migration.sql).digest("hex")

    if (applied.has(hash)) continue

    // Split on drizzle's statement-breakpoint markers
    const statements = migration.sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)

    // Wrap in a transaction so it's all-or-nothing. If any statement fails
    // (other than "already exists"), the entire migration is rolled back and
    // NOT recorded as applied — preventing partial schema corruption.
    const runMigration = sqlite.transaction(() => {
      for (const stmt of statements) {
        try {
          sqlite.exec(stmt)
        } catch (error) {
          // Handle "already exists" errors gracefully — this happens when
          // transitioning from drizzle's filesystem migrator (which uses
          // different hashes) to embedded migrations. The DDL uses
          // IF NOT EXISTS, but this catch is a safety net.
          const message = error instanceof Error ? error.message : String(error)
          if (message.includes("already exists")) {
            continue
          }
          throw error
        }
      }

      // Record migration as applied — inside the transaction so it's
      // only persisted if all statements succeeded.
      sqlite.prepare(
        'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)'
      ).run(hash, Date.now())
    })

    runMigration()
  }
}
