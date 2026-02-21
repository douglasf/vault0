import { useState, useEffect, useRef } from "react"

export interface GitStatus {
  /** Current branch name (or "HEAD" if detached) */
  branch: string
  /** Number of staged files */
  staged: number
  /** Number of modified (unstaged) files */
  modified: number
  /** Number of untracked files */
  untracked: number
  /** Commits ahead of remote */
  ahead: number
  /** Commits behind remote */
  behind: number
  /** Whether this is a git repo at all */
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

/** Run a command and return trimmed stdout, or null on failure */
async function exec(cmd: string[]): Promise<string | null> {
  try {
    const proc = Bun.spawn(cmd, {
      stdout: "pipe",
      stderr: "pipe",
    })
    const text = await new Response(proc.stdout).text()
    const code = await proc.exited
    if (code !== 0) return null
    return text.trim()
  } catch {
    return null
  }
}

async function fetchGitStatus(): Promise<GitStatus> {
  // Check if we're in a git repo
  const topLevel = await exec(["git", "rev-parse", "--show-toplevel"])
  if (topLevel === null) return EMPTY_STATUS

  // Get branch name
  const branch = await exec(["git", "rev-parse", "--abbrev-ref", "HEAD"]) || "HEAD"

  // Get porcelain status for file counts
  const porcelain = await exec(["git", "status", "--porcelain=v1"])
  let staged = 0
  let modified = 0
  let untracked = 0

  if (porcelain) {
    for (const line of porcelain.split("\n")) {
      if (!line) continue
      const x = line[0] // index (staged) indicator
      const y = line[1] // worktree indicator

      if (x === "?" && y === "?") {
        untracked++
      } else {
        // Staged: index column is not space and not '?'
        if (x !== " " && x !== "?") staged++
        // Modified (unstaged): worktree column is not space
        if (y !== " " && y !== "?") modified++
      }
    }
  }

  // Get ahead/behind from upstream tracking
  let ahead = 0
  let behind = 0
  const abOutput = await exec(["git", "rev-list", "--left-right", "--count", "@{upstream}...HEAD"])
  if (abOutput) {
    const parts = abOutput.split(/\s+/)
    if (parts.length === 2) {
      behind = Number.parseInt(parts[0], 10) || 0
      ahead = Number.parseInt(parts[1], 10) || 0
    }
  }

  return { branch, staged, modified, untracked, ahead, behind, isRepo: true }
}

/**
 * Formats git status into a compact one-line string for the TUI header.
 *
 * Examples:
 *   " main"                          — clean, on main
 *   " main  +2 ~3 ?1"              — staged/modified/untracked
 *   " feat/foo  ↑2 ↓1"             — ahead/behind remote
 *   " main  +2 ~3 ?1  ↑2 ↓1"      — everything
 */
export function formatGitStatus(status: GitStatus): string {
  if (!status.isRepo) return "not a git repo"

  const parts: string[] = [`\ue0a0 ${status.branch}`]

  // File changes
  const changes: string[] = []
  if (status.staged > 0) changes.push(`+${status.staged}`)
  if (status.modified > 0) changes.push(`~${status.modified}`)
  if (status.untracked > 0) changes.push(`?${status.untracked}`)
  if (changes.length > 0) parts.push(changes.join(" "))

  // Remote tracking
  const remote: string[] = []
  if (status.ahead > 0) remote.push(`↑${status.ahead}`)
  if (status.behind > 0) remote.push(`↓${status.behind}`)
  if (remote.length > 0) parts.push(remote.join(" "))

  return parts.join("  ")
}

/**
 * Hook that polls git status periodically and returns a compact status object.
 * Refreshes every `intervalMs` (default 5s) and once on mount.
 */
export function useGitStatus(intervalMs = 5000): GitStatus {
  const [status, setStatus] = useState<GitStatus>(EMPTY_STATUS)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    const refresh = async () => {
      const result = await fetchGitStatus()
      if (mountedRef.current) setStatus(result)
    }

    // Fetch immediately
    refresh()

    // Then poll
    const timer = setInterval(refresh, intervalMs)

    return () => {
      mountedRef.current = false
      clearInterval(timer)
    }
  }, [intervalMs])

  return status
}
