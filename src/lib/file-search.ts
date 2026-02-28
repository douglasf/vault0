import { readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

// ── File Search ─────────────────────────────────────────────────────────

/** Directories to always skip when scanning for project files */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".vault0",
  "dist",
  ".DS_Store",
  ".next",
  ".nuxt",
  "coverage",
  "__pycache__",
  ".cache",
  "build",
  "target",
])

/** Max files to collect (safety limit for large repos) */
const MAX_FILES = 5000

/** Max directory depth to traverse */
const MAX_DEPTH = 12

/**
 * Recursively collect project-relative file paths, skipping ignored directories.
 *
 * @param rootDir  Absolute path to the project root
 * @returns Array of project-relative file paths (e.g. "src/lib/types.ts")
 */
export function getProjectFiles(rootDir: string): string[] {
  const files: string[] = []
  walk(rootDir, rootDir, files, 0)
  return files
}

function walk(dir: string, rootDir: string, files: string[], depth: number): void {
  if (depth > MAX_DEPTH || files.length >= MAX_FILES) return

  let entries: string[]
  try {
    entries = readdirSync(dir, { encoding: "utf-8" }) as string[]
  } catch {
    return
  }

  for (const entry of entries) {
    if (files.length >= MAX_FILES) return
    if (entry.startsWith(".") && entry !== "." && entry !== "..") continue
    if (IGNORED_DIRS.has(entry)) continue

    const fullPath = join(dir, entry)
    let isDir: boolean
    try {
      isDir = statSync(fullPath).isDirectory()
    } catch {
      continue
    }

    if (isDir) {
      walk(fullPath, rootDir, files, depth + 1)
    } else {
      files.push(relative(rootDir, fullPath))
    }
  }
}

/**
 * Simple fuzzy match — checks if all characters of the query appear
 * in order in the target string (case-insensitive).
 */
export function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true
  const lowerQuery = query.toLowerCase()
  const lowerTarget = target.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < lowerTarget.length && qi < lowerQuery.length; ti++) {
    if (lowerTarget[ti] === lowerQuery[qi]) {
      qi++
    }
  }
  return qi === lowerQuery.length
}

/**
 * Score a fuzzy match — lower is better. Returns -1 if no match.
 * Prioritises: exact substring > path segment match > fuzzy spread.
 */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 0
  const lq = query.toLowerCase()
  const lt = target.toLowerCase()

  // Exact substring bonus
  const substringIdx = lt.indexOf(lq)
  if (substringIdx !== -1) return substringIdx

  // Fuzzy character spread
  let qi = 0
  let spread = 0
  let lastMatch = -1
  for (let ti = 0; ti < lt.length && qi < lq.length; ti++) {
    if (lt[ti] === lq[qi]) {
      if (lastMatch >= 0) spread += ti - lastMatch - 1
      lastMatch = ti
      qi++
    }
  }
  if (qi < lq.length) return -1
  return 1000 + spread
}

/**
 * Filter and sort project files by fuzzy query.
 *
 * @param files  Array of project-relative file paths
 * @param query  User search query
 * @param limit  Max results to return (default 50)
 */
export function searchFiles(files: string[], query: string, limit = 50): string[] {
  if (!query) return files.slice(0, limit)

  const scored: Array<{ path: string; score: number }> = []
  for (const f of files) {
    const s = fuzzyScore(query, f)
    if (s >= 0) scored.push({ path: f, score: s })
  }
  scored.sort((a, b) => a.score - b.score)
  return scored.slice(0, limit).map((s) => s.path)
}
