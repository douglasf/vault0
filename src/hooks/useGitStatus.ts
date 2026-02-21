// Git status hook — REMOVED
//
// This module previously polled `git status` via Bun.spawn every 5 seconds.
// The spawned child processes accumulated and were never fully reaped, causing
// Bun to OOM-crash after extended TUI sessions. The feature has been removed
// entirely as a stability mitigation.
//
// Exports are preserved as no-ops so any stale imports fail gracefully rather
// than at compile time.

export interface GitStatus {
  branch: string
  staged: number
  modified: number
  untracked: number
  ahead: number
  behind: number
  isRepo: boolean
}

const EMPTY_STATUS: GitStatus = {
  branch: "",
  staged: 0,
  modified: 0,
  untracked: 0,
  ahead: 0,
  behind: 0,
  isRepo: false,
}

/** @deprecated Git status polling has been removed. Always returns empty status. */
export function formatGitStatus(_status: GitStatus): string {
  return ""
}

/** @deprecated Git status polling has been removed. Always returns empty status. */
export function useGitStatus(_intervalMs?: number): GitStatus {
  return EMPTY_STATUS
}
