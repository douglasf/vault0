import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { ORCHESTRATION_CORE } from "./orchestration-core.js"
import { DELEGATION_PATTERNS } from "./delegation-patterns.js"
import { TASK_DISCOVERY } from "./task-discovery.js"
import { EXECUTION_CORE } from "./execution-core.js"
import { INVESTIGATION_METHODOLOGY } from "./investigation-methodology.js"
import { PLANNING_METHODOLOGY } from "./planning-methodology.js"
import { TASK_COMPOSITION } from "./task-composition.js"
import { GIT_WORKFLOW } from "./git-workflow.js"
import { POST_COMMIT_APPROVAL } from "./post-commit-approval.js"
import { ERROR_HANDLING } from "./error-handling.js"

// ── Instruction Block Registry ──────────────────────────────────────────

/** All bundled instruction blocks keyed by name */
export const INSTRUCTION_BLOCKS: Record<string, string> = {
  "orchestration-core": ORCHESTRATION_CORE,
  "delegation-patterns": DELEGATION_PATTERNS,
  "task-discovery": TASK_DISCOVERY,
  "execution-core": EXECUTION_CORE,
  "investigation-methodology": INVESTIGATION_METHODOLOGY,
  "planning-methodology": PLANNING_METHODOLOGY,
  "task-composition": TASK_COMPOSITION,
  "git-workflow": GIT_WORKFLOW,
  "post-commit-approval": POST_COMMIT_APPROVAL,
  "error-handling": ERROR_HANDLING,
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
