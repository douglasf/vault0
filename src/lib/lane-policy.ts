import type { Status } from "./types.js"
import type { LanePolicies, LanePolicy } from "./config.js"
import { VISIBLE_STATUSES, STATUS_LABELS } from "./constants.js"

// ── Policy Resolution ───────────────────────────────────────────────

/**
 * Get the effective policy for a lane, falling back to defaults.
 * Lanes without explicit config are visible with no WIP limit.
 */
export function getLanePolicy(policies: LanePolicies | undefined, status: Status): LanePolicy {
  return policies?.[status] ?? { visible: true }
}

/**
 * Returns the subset of VISIBLE_STATUSES that are not hidden by policy.
 * Used by the TUI to determine which columns to render.
 */
export function getVisibleLanes(policies: LanePolicies | undefined): Status[] {
  return VISIBLE_STATUSES.filter((s) => getLanePolicy(policies, s).visible !== false)
}

// ── Validation ──────────────────────────────────────────────────────

export interface PolicyViolation {
  kind: "hidden_lane" | "wip_limit"
  message: string
}

/**
 * Check whether creating a task in the given status violates lane policies.
 * Returns a violation if the lane is hidden (tasks cannot be created directly
 * in hidden lanes) or if the WIP limit would be exceeded.
 *
 * @param policies - Lane policy configuration (undefined = no restrictions)
 * @param status - The target status for the new task
 * @param currentCount - Current number of non-archived tasks in that lane
 */
export function validateTaskCreation(
  policies: LanePolicies | undefined,
  status: Status,
  currentCount: number,
): PolicyViolation | null {
  if (!policies) return null

  const policy = getLanePolicy(policies, status)

  // Cannot create tasks directly in hidden lanes
  if (policy.visible === false) {
    return {
      kind: "hidden_lane",
      message: `Cannot create task in hidden lane "${STATUS_LABELS[status]}". Move it from a visible lane instead.`,
    }
  }

  // Check WIP limit
  if (policy.wipLimit !== undefined && currentCount >= policy.wipLimit) {
    return {
      kind: "wip_limit",
      message: `WIP limit reached for "${STATUS_LABELS[status]}" (${policy.wipLimit}). Complete or move existing tasks first.`,
    }
  }

  return null
}

/**
 * Check whether moving a task into the given status violates WIP limits.
 * Hidden-lane checks are NOT applied to moves — tasks can be moved into
 * hidden lanes (e.g. "done"), they just can't be created there directly.
 *
 * @param policies - Lane policy configuration (undefined = no restrictions)
 * @param targetStatus - The status the task is being moved to
 * @param currentCount - Current number of non-archived tasks in the target lane
 */
export function validateTaskMove(
  policies: LanePolicies | undefined,
  targetStatus: Status,
  currentCount: number,
): PolicyViolation | null {
  if (!policies) return null

  const policy = getLanePolicy(policies, targetStatus)

  if (policy.wipLimit !== undefined && currentCount >= policy.wipLimit) {
    return {
      kind: "wip_limit",
      message: `WIP limit reached for "${STATUS_LABELS[targetStatus]}" (${policy.wipLimit}). Complete or move existing tasks first.`,
    }
  }

  return null
}
