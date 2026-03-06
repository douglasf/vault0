import { useState, useEffect, useRef, useCallback } from "react"
import { watch, existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import type { FSWatcher } from "node:fs"

// ── Types ───────────────────────────────────────────────────────────

export type RepoState = "clean" | "merging" | "rebasing"

export interface RepoStatus {
  branch: string
  ahead: number
  behind: number
  modifiedCount: number
  state: RepoState
}

// ── Git Metadata Readers ────────────────────────────────────────────

/**
 * Resolve the .git directory. Handles both normal repos and worktrees
 * (where .git is a file containing "gitdir: /path/to/actual/.git").
 */
function resolveGitDir(repoRoot: string): string | null {
  const dotGit = join(repoRoot, ".git")
  try {
    const stat = statSync(dotGit)
    if (stat.isDirectory()) return dotGit
    // Worktree: .git is a file
    const content = readFileSync(dotGit, "utf-8").trim()
    const match = content.match(/^gitdir:\s*(.+)$/)
    if (match) return match[1]
    return null
  } catch {
    return null
  }
}

/**
 * Read current branch name from git metadata files (no subprocess).
 */
function readBranch(gitDir: string): string {
  try {
    const head = readFileSync(join(gitDir, "HEAD"), "utf-8").trim()
    const refMatch = head.match(/^ref: refs\/heads\/(.+)$/)
    if (refMatch) return refMatch[1]
    // Detached HEAD — show short hash
    return head.slice(0, 7)
  } catch {
    return ""
  }
}

/**
 * Detect merge/rebase state from git metadata files.
 */
function readState(gitDir: string): RepoState {
  if (existsSync(join(gitDir, "MERGE_HEAD"))) return "merging"
  if (existsSync(join(gitDir, "rebase-merge")) || existsSync(join(gitDir, "rebase-apply"))) return "rebasing"
  return "clean"
}

/**
 * Count modified/untracked files using `git status --porcelain`.
 * This is the one place we must shell out — the index format is binary.
 * Uses Bun.spawnSync for synchronous execution with automatic cleanup.
 */
function readModifiedCount(repoRoot: string): number {
  try {
    const result = Bun.spawnSync(["git", "status", "--porcelain"], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    })
    if (result.exitCode !== 0) return 0
    const output = result.stdout.toString().trim()
    if (!output) return 0
    return output.split("\n").length
  } catch {
    return 0
  }
}

/**
 * Read ahead/behind counts by comparing local and upstream refs.
 * Reads packed-refs and loose refs — no subprocess needed.
 */
function readAheadBehind(repoRoot: string): { ahead: number; behind: number } {
  try {
    const result = Bun.spawnSync(
      ["git", "rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
      { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
    )
    if (result.exitCode !== 0) return { ahead: 0, behind: 0 }
    const parts = result.stdout.toString().trim().split(/\s+/)
    return {
      ahead: Number.parseInt(parts[0], 10) || 0,
      behind: Number.parseInt(parts[1], 10) || 0,
    }
  } catch {
    return { ahead: 0, behind: 0 }
  }
}

/**
 * Collect full repo status from git metadata + minimal subprocess calls.
 */
function collectStatus(repoRoot: string, gitDir: string): RepoStatus {
  const branch = readBranch(gitDir)
  const state = readState(gitDir)
  const modifiedCount = readModifiedCount(repoRoot)
  const { ahead, behind } = readAheadBehind(repoRoot)
  return { branch, ahead, behind, modifiedCount, state }
}

// ── Hook ────────────────────────────────────────────────────────────

/**
 * Watches git metadata files for changes and returns the current repo status.
 *
 * Uses filesystem watchers on .git/HEAD, .git/refs/, .git/index, etc.
 * following the same pattern as useDbWatcher. Debounces rapid events.
 *
 * Returns null if repoRoot is not a git repository.
 */
export function useRepoStatus(repoRoot: string | null): RepoStatus | null {
  const [status, setStatus] = useState<RepoStatus | null>(null)
  const repoRootRef = useRef(repoRoot)
  repoRootRef.current = repoRoot

  useEffect(() => {
    if (!repoRoot) return

    const gitDir = resolveGitDir(repoRoot)
    if (!gitDir) return

    // Initial read
    setStatus(collectStatus(repoRoot, gitDir))

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const watchers: FSWatcher[] = []

    // Suppress events during startup (same pattern as useDbWatcher)
    let ready = false
    const startupTimer = setTimeout(() => { ready = true }, 500)

    const handleChange = () => {
      if (!ready) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        const root = repoRootRef.current
        if (root) {
          const gd = resolveGitDir(root)
          if (gd) setStatus(collectStatus(root, gd))
        }
      }, 300)
    }

    // Watch key git metadata paths
    const watchTargets = [
      gitDir,                        // HEAD, MERGE_HEAD, index, etc.
      join(gitDir, "refs"),          // branch refs, remote tracking refs
    ]

    for (const target of watchTargets) {
      try {
        if (!existsSync(target)) continue
        const w = watch(target, { persistent: false, recursive: true }, handleChange)
        w.on("error", () => { /* silent — watcher may fail */ })
        watchers.push(w)
      } catch {
        // Silent degradation
      }
    }

    return () => {
      clearTimeout(startupTimer)
      if (debounceTimer) clearTimeout(debounceTimer)
      for (const w of watchers) w.close()
    }
  }, [repoRoot])

  return status
}
