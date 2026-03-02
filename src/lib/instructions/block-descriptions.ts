// ── Instruction Block Metadata ──────────────────────────────────────────

/** Metadata for a single instruction block */
export interface BlockDescriptor {
  /** Block name (must match key in INSTRUCTION_BLOCKS) */
  name: string
  /** Short user-friendly description */
  description: string
  /** Default agents that should have this block enabled */
  defaultAgents: string[]
}

/** All instruction blocks with descriptions and default agent mappings (role keywords) */
export const BLOCK_DESCRIPTORS: BlockDescriptor[] = [
  {
    name: "orchestration-core",
    description: "Core rules for task orchestration, delegation, and dispatch",
    defaultAgents: ["orchestrator"],
  },
  {
    name: "task-discovery",
    description: "Rules for finding ready tasks, dependencies, and prioritization",
    defaultAgents: ["orchestrator"],
  },
  {
    name: "execution-core",
    description: "Single-task execution workflow and reporting",
    defaultAgents: ["executor"],
  },
  {
    name: "investigation-methodology",
    description: "Code exploration and analysis patterns",
    defaultAgents: ["executor", "investigator"],
  },
  {
    name: "planning-methodology",
    description: "Breaking work into structured subtasks",
    defaultAgents: ["planner"],
  },
  {
    name: "task-composition",
    description: "Creating well-formed task descriptions and acceptance criteria",
    defaultAgents: ["planner"],
  },
  {
    name: "delegation-patterns",
    description: "How to delegate work effectively to agents",
    defaultAgents: ["orchestrator"],
  },
  {
    name: "git-workflow",
    description: "Git operations, commits, and conflict handling",
    defaultAgents: ["git-agent"],
  },
  {
    name: "post-commit-approval",
    description: "Auto-approval of related tasks after commits",
    defaultAgents: ["git-agent"],
  },
  {
    name: "error-handling",
    description: "Error recovery and fallback strategies",
    defaultAgents: ["orchestrator", "executor"],
  },
]

/** Get block descriptor by name */
export function getBlockDescriptor(name: string): BlockDescriptor | undefined {
  return BLOCK_DESCRIPTORS.find(b => b.name === name)
}

/** Guess the role keyword for a given agent name */
export function guessRoleForAgent(agent: string): string {
  if (agent.includes("git")) return "git-agent"
  if (agent.includes("plan") || agent.includes("arch")) return "planner"
  if (agent.includes("exec")) return "executor"
  if (agent.includes("orch")) return "orchestrator"
  if (agent.includes("invest") || agent.includes("vincent")) return "investigator"
  return "executor"
}

/** Get default blocks for an agent name (uses role-based keyword matching) */
export function getDefaultBlocksForAgent(agent: string): string[] {
  const role = guessRoleForAgent(agent)
  return BLOCK_DESCRIPTORS
    .filter(b => b.defaultAgents.includes(role))
    .map(b => b.name)
}
