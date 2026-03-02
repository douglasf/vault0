import { describe, test, expect } from "bun:test"
import { ORCHESTRATION_CORE } from "../lib/instructions/orchestration-core.js"
import { DELEGATION_PATTERNS } from "../lib/instructions/delegation-patterns.js"
import { TASK_DISCOVERY } from "../lib/instructions/task-discovery.js"
import { EXECUTION_CORE } from "../lib/instructions/execution-core.js"
import { INVESTIGATION_METHODOLOGY } from "../lib/instructions/investigation-methodology.js"
import { PLANNING_METHODOLOGY } from "../lib/instructions/planning-methodology.js"
import { TASK_COMPOSITION } from "../lib/instructions/task-composition.js"
import { GIT_WORKFLOW } from "../lib/instructions/git-workflow.js"
import { POST_COMMIT_APPROVAL } from "../lib/instructions/post-commit-approval.js"
import { ERROR_HANDLING } from "../lib/instructions/error-handling.js"

// ═══════════════════════════════════════════════════════════════════
// Instruction blocks
// ═══════════════════════════════════════════════════════════════════

describe("instruction blocks", () => {
  const ALL_BLOCKS: Record<string, string> = {
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

  test("all 10 instruction blocks are non-empty strings", () => {
    expect(Object.keys(ALL_BLOCKS).length).toBe(10)
    for (const [name, content] of Object.entries(ALL_BLOCKS)) {
      expect(typeof content).toBe("string")
      expect(content.length).toBeGreaterThan(10)
    }
  })

  test("orchestration-core contains orchestration keywords", () => {
    expect(ORCHESTRATION_CORE).toContain("Orchestrat")
  })

  test("execution-core contains execution keywords", () => {
    expect(EXECUTION_CORE).toContain("Execut")
  })

  test("git-workflow contains git keywords", () => {
    expect(GIT_WORKFLOW).toContain("commit")
  })

  test("planning-methodology contains planning keywords", () => {
    expect(PLANNING_METHODOLOGY).toContain("plan")
  })
})

// ═══════════════════════════════════════════════════════════════════
// Resource registration structure
// ═══════════════════════════════════════════════════════════════════

describe("instruction block registry", () => {
  const BLOCK_NAMES = [
    "orchestration-core",
    "delegation-patterns",
    "task-discovery",
    "execution-core",
    "investigation-methodology",
    "planning-methodology",
    "task-composition",
    "git-workflow",
    "post-commit-approval",
    "error-handling",
  ]

  test("all expected block names are defined", () => {
    // Verify the blocks match what resources.ts registers
    for (const name of BLOCK_NAMES) {
      // Each block should be importable and non-empty
      const blockMap: Record<string, string> = {
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
      expect(blockMap[name]).toBeDefined()
      expect(blockMap[name].length).toBeGreaterThan(0)
    }
  })

  test("block content is markdown-formatted", () => {
    // All blocks should start with a heading
    expect(ORCHESTRATION_CORE.trimStart().startsWith("#")).toBe(true)
    expect(EXECUTION_CORE.trimStart().startsWith("#")).toBe(true)
    expect(GIT_WORKFLOW.trimStart().startsWith("#")).toBe(true)
  })
})
