// ── Instruction Block Metadata ──────────────────────────────────────────

/** Metadata for a single instruction block */
export interface BlockDescriptor {
  /** Block name (must match key in INSTRUCTION_BLOCKS) */
  name: string
  /** Short user-friendly description */
  description: string
  /** vault0 tools that trigger this block — if an agent has ANY of these tools, it should get this block */
  requiredTools: string[]
}

/** All instruction blocks with descriptions and tool-based triggers */
export const BLOCK_DESCRIPTORS: BlockDescriptor[] = [
  {
    name: "tool-reference",
    description: "Pure reference for all vault0 task tools, valid values, hierarchy rules",
    requiredTools: ["vault0_task-list", "vault0_task-view", "vault0_task-add", "vault0_task-update", "vault0_task-move", "vault0_task-complete", "vault0_task-subtasks"],
  },
  {
    name: "task-delegation",
    description: "Discovering ready tasks and delegating them to other agents",
    requiredTools: ["vault0_task-list", "vault0_task-subtasks"],
  },
  {
    name: "task-execution",
    description: "Claiming a task, implementing it, and submitting for review",
    requiredTools: ["vault0_task-view", "vault0_task-move"],
  },
  {
    name: "task-planning",
    description: "Creating structured plans as vault0 parent tasks and subtasks",
    requiredTools: ["vault0_task-add"],
  },
  {
    name: "task-completion",
    description: "Marking tasks as done after commits via vault0_task-complete",
    requiredTools: ["vault0_task-complete"],
  },
  {
    name: "ulid-is-task-id",
    description: "Recognize ULIDs as vault0 task IDs and resolve them via task-view",
    requiredTools: ["vault0_task-view"],
  },
  {
    name: "query-fresh-before-acting",
    description: "Always call task-view before any mutation to get current state",
    requiredTools: ["vault0_task-view", "vault0_task-update", "vault0_task-move", "vault0_task-complete"],
  },
  {
    name: "one-level-nesting-only",
    description: "Subtasks cannot have children — only one level of nesting allowed",
    requiredTools: ["vault0_task-add"],
  },
  {
    name: "no-markdown-fallback",
    description: "Never use markdown or conversation memory for task tracking — use vault0 tools",
    requiredTools: ["vault0_task-list", "vault0_task-add", "vault0_task-view"],
  },
  {
    name: "parent-before-subtasks",
    description: "Create the parent task before creating any subtasks under it",
    requiredTools: ["vault0_task-add"],
  },
  {
    name: "source-flag-provenance",
    description: "Tag tasks with sourceFlag to distinguish user-requested from agent-inferred work",
    requiredTools: ["vault0_task-add"],
  },
  {
    name: "claim-with-in-progress",
    description: "Move task to in_progress before starting implementation work",
    requiredTools: ["vault0_task-move"],
  },
  {
    name: "submit-with-in-review",
    description: "Move task to in_review when implementation is complete, not directly to done",
    requiredTools: ["vault0_task-move"],
  },
  {
    name: "single-task-then-stop",
    description: "Execute one task per turn then return control to the orchestrator",
    requiredTools: ["vault0_task-move"],
  },
  {
    name: "include-task-id-when-delegating",
    description: "Always include the full ULID when delegating tasks to other agents",
    requiredTools: ["vault0_task-list", "vault0_task-subtasks"],
  },
  {
    name: "discover-ready-before-delegating",
    description: "Query vault0 for ready tasks before choosing what to delegate",
    requiredTools: ["vault0_task-list", "vault0_task-subtasks"],
  },
  {
    name: "promote-parent-when-subtasks-exhausted",
    description: "Move parent to in_review when all subtasks are done or cancelled",
    requiredTools: ["vault0_task-subtasks", "vault0_task-move"],
  },
  {
    name: "post-commit-complete-in-review",
    description: "Complete correlated in_review tasks after successful git commits",
    requiredTools: ["vault0_task-complete"],
  },
  {
    name: "post-commit-stop",
    description: "Stop and return control after post-commit task housekeeping",
    requiredTools: ["vault0_task-complete"],
  },
  {
    name: "delegate-only-ready-tasks",
    description: "Only delegate unblocked tasks in todo status to other agents",
    requiredTools: ["vault0_task-list", "vault0_task-subtasks"],
  },
  {
    name: "solution-notes-on-update",
    description: "Use the solution field to record implementation context on task updates",
    requiredTools: ["vault0_task-update", "vault0_task-move", "vault0_task-complete"],
  },
  {
    name: "dependencies-for-sequential-only",
    description: "Only add dependency edges where there is a true sequential constraint",
    requiredTools: ["vault0_task-update"],
  },
  {
    name: "error-stop-and-report",
    description: "Stop immediately and report to orchestrator on vault0 tool errors",
    requiredTools: ["vault0_task-list", "vault0_task-view", "vault0_task-add", "vault0_task-update", "vault0_task-move", "vault0_task-complete", "vault0_task-subtasks"],
  },
]

/** Get block descriptor by name */
export function getBlockDescriptor(name: string): BlockDescriptor | undefined {
  return BLOCK_DESCRIPTORS.find(b => b.name === name)
}

/**
 * Get instruction blocks for an agent based on its available tools.
 * If the agent has ANY tool listed in a block's requiredTools, it gets that block.
 */
export function getBlocksForTools(tools: string[]): string[] {
  return BLOCK_DESCRIPTORS
    .filter(b => b.requiredTools.some(t => tools.includes(t)))
    .map(b => b.name)
}

/**
 * @deprecated Use getBlocksForTools instead. Kept for backward compatibility.
 * Guess the role keyword for a given agent name and return default blocks.
 */
export function guessRoleForAgent(agent: string): string {
  if (agent.includes("git")) return "git-agent"
  if (agent.includes("plan") || agent.includes("arch")) return "planner"
  if (agent.includes("exec")) return "executor"
  if (agent.includes("orch")) return "orchestrator"
  if (agent.includes("invest") || agent.includes("vincent")) return "investigator"
  return "executor"
}

/** @deprecated Use getBlocksForTools instead. */
export function getDefaultBlocksForAgent(agent: string): string[] {
  const role = guessRoleForAgent(agent)
  const roleToBlocks: Record<string, string[]> = {
    "orchestrator": ["tool-reference", "task-delegation"],
    "executor": ["tool-reference", "task-execution"],
    "planner": ["tool-reference", "task-planning"],
    "git-agent": ["tool-reference", "task-completion"],
    "investigator": ["tool-reference"],
  }
  return roleToBlocks[role] ?? ["tool-reference"]
}
