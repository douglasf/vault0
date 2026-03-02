import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { TOOL_REFERENCE } from "./tool-reference.js"
import { TASK_DELEGATION } from "./task-delegation.js"
import { TASK_EXECUTION } from "./task-execution.js"
import { TASK_PLANNING } from "./task-planning.js"
import { TASK_COMPLETION } from "./task-completion.js"
import { ULID_IS_TASK_ID } from "./ulid-is-task-id.js"
import { QUERY_FRESH_BEFORE_ACTING } from "./query-fresh-before-acting.js"
import { ONE_LEVEL_NESTING_ONLY } from "./one-level-nesting-only.js"
import { NO_MARKDOWN_FALLBACK } from "./no-markdown-fallback.js"
import { PARENT_BEFORE_SUBTASKS } from "./parent-before-subtasks.js"
import { SOURCE_FLAG_PROVENANCE } from "./source-flag-provenance.js"
import { CLAIM_WITH_IN_PROGRESS } from "./claim-with-in-progress.js"
import { SUBMIT_WITH_IN_REVIEW } from "./submit-with-in-review.js"
import { SINGLE_TASK_THEN_STOP } from "./single-task-then-stop.js"
import { INCLUDE_TASK_ID_WHEN_DELEGATING } from "./include-task-id-when-delegating.js"
import { DISCOVER_READY_BEFORE_DELEGATING } from "./discover-ready-before-delegating.js"
import { PROMOTE_PARENT_WHEN_SUBTASKS_EXHAUSTED } from "./promote-parent-when-subtasks-exhausted.js"
import { POST_COMMIT_COMPLETE_IN_REVIEW } from "./post-commit-complete-in-review.js"
import { POST_COMMIT_STOP } from "./post-commit-stop.js"
import { DELEGATE_ONLY_READY_TASKS } from "./delegate-only-ready-tasks.js"
import { SOLUTION_NOTES_ON_UPDATE } from "./solution-notes-on-update.js"
import { DEPENDENCIES_FOR_SEQUENTIAL_ONLY } from "./dependencies-for-sequential-only.js"
import { ERROR_STOP_AND_REPORT } from "./error-stop-and-report.js"

// ── Instruction Block Registry ──────────────────────────────────────────

/** All bundled instruction blocks keyed by name */
export const INSTRUCTION_BLOCKS: Record<string, string> = {
  "tool-reference": TOOL_REFERENCE,
  "task-delegation": TASK_DELEGATION,
  "task-execution": TASK_EXECUTION,
  "task-planning": TASK_PLANNING,
  "task-completion": TASK_COMPLETION,
  "ulid-is-task-id": ULID_IS_TASK_ID,
  "query-fresh-before-acting": QUERY_FRESH_BEFORE_ACTING,
  "one-level-nesting-only": ONE_LEVEL_NESTING_ONLY,
  "no-markdown-fallback": NO_MARKDOWN_FALLBACK,
  "parent-before-subtasks": PARENT_BEFORE_SUBTASKS,
  "source-flag-provenance": SOURCE_FLAG_PROVENANCE,
  "claim-with-in-progress": CLAIM_WITH_IN_PROGRESS,
  "submit-with-in-review": SUBMIT_WITH_IN_REVIEW,
  "single-task-then-stop": SINGLE_TASK_THEN_STOP,
  "include-task-id-when-delegating": INCLUDE_TASK_ID_WHEN_DELEGATING,
  "discover-ready-before-delegating": DISCOVER_READY_BEFORE_DELEGATING,
  "promote-parent-when-subtasks-exhausted": PROMOTE_PARENT_WHEN_SUBTASKS_EXHAUSTED,
  "post-commit-complete-in-review": POST_COMMIT_COMPLETE_IN_REVIEW,
  "post-commit-stop": POST_COMMIT_STOP,
  "delegate-only-ready-tasks": DELEGATE_ONLY_READY_TASKS,
  "solution-notes-on-update": SOLUTION_NOTES_ON_UPDATE,
  "dependencies-for-sequential-only": DEPENDENCIES_FOR_SEQUENTIAL_ONLY,
  "error-stop-and-report": ERROR_STOP_AND_REPORT,
}

// ── Filesystem Override ─────────────────────────────────────────────────

const OVERRIDE_DIR = join(homedir(), ".config", "vault0", "instructions")

/**
 * Get instruction content by name, with filesystem override support.
 * If ~/.config/vault0/instructions/<name>.md exists, load from there instead of bundled.
 */
export function getInstructionContent(name: string): string | undefined {
  // Check filesystem override first
  const overridePath = join(OVERRIDE_DIR, `${name}.md`)
  if (existsSync(overridePath)) {
    try {
      return readFileSync(overridePath, "utf-8")
    } catch {
      // Fall through to bundled version
    }
  }

  return INSTRUCTION_BLOCKS[name]
}
