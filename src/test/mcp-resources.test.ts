import { describe, test, expect } from "bun:test"
import { TOOL_REFERENCE } from "../lib/instructions/tool-reference.js"
import { TASK_DELEGATION } from "../lib/instructions/task-delegation.js"
import { TASK_EXECUTION } from "../lib/instructions/task-execution.js"
import { TASK_PLANNING } from "../lib/instructions/task-planning.js"
import { TASK_COMPLETION } from "../lib/instructions/task-completion.js"

// ═══════════════════════════════════════════════════════════════════
// Instruction blocks
// ═══════════════════════════════════════════════════════════════════

describe("instruction blocks", () => {
  const ALL_BLOCKS: Record<string, string> = {
    "tool-reference": TOOL_REFERENCE,
    "task-delegation": TASK_DELEGATION,
    "task-execution": TASK_EXECUTION,
    "task-planning": TASK_PLANNING,
    "task-completion": TASK_COMPLETION,
  }

  test("all 5 instruction blocks are non-empty strings", () => {
    expect(Object.keys(ALL_BLOCKS).length).toBe(5)
    for (const [name, content] of Object.entries(ALL_BLOCKS)) {
      expect(typeof content).toBe("string")
      expect(content.length).toBeGreaterThan(10)
    }
  })

  test("tool-reference contains tool names", () => {
    expect(TOOL_REFERENCE).toContain("vault0_task-list")
    expect(TOOL_REFERENCE).toContain("vault0_task-complete")
  })

  test("task-delegation contains delegation keywords", () => {
    expect(TASK_DELEGATION).toContain("Delegate")
  })

  test("task-execution contains execution keywords", () => {
    expect(TASK_EXECUTION).toContain("Claim")
    expect(TASK_EXECUTION).toContain("in_review")
  })

  test("task-planning contains planning keywords", () => {
    expect(TASK_PLANNING).toContain("plan")
    expect(TASK_PLANNING).toContain("subtask")
  })

  test("task-completion contains completion keywords", () => {
    expect(TASK_COMPLETION).toContain("vault0_task-complete")
    expect(TASK_COMPLETION).toContain("MANDATORY")
  })
})

// ═══════════════════════════════════════════════════════════════════
// Resource registration structure
// ═══════════════════════════════════════════════════════════════════

describe("instruction block registry", () => {
  const BLOCK_NAMES = [
    "tool-reference",
    "task-delegation",
    "task-execution",
    "task-planning",
    "task-completion",
  ]

  test("all expected block names are defined", () => {
    const blockMap: Record<string, string> = {
      "tool-reference": TOOL_REFERENCE,
      "task-delegation": TASK_DELEGATION,
      "task-execution": TASK_EXECUTION,
      "task-planning": TASK_PLANNING,
      "task-completion": TASK_COMPLETION,
    }
    for (const name of BLOCK_NAMES) {
      expect(blockMap[name]).toBeDefined()
      expect(blockMap[name].length).toBeGreaterThan(0)
    }
  })

  test("block content is markdown-formatted", () => {
    expect(TOOL_REFERENCE.trimStart().startsWith("#")).toBe(true)
    expect(TASK_EXECUTION.trimStart().startsWith("#")).toBe(true)
    expect(TASK_COMPLETION.trimStart().startsWith("#")).toBe(true)
  })
})
