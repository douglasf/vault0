import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

// Version is injected at compile time via --define in Makefile.
// During dev (bun run), the placeholder remains and we fall back to reading package.json.
declare const __VAULT0_VERSION__: string | undefined

/** Resolved application version — compile-time injected or read from package.json, with "dev" fallback. */
export const VERSION: string = (() => {
  // Compile-time injected value (bundled binary)
  try {
    if (typeof __VAULT0_VERSION__ !== "undefined") return __VAULT0_VERSION__
  } catch { /* not defined — dev mode */ }
  // Dev mode: read from package.json relative to this file
  try {
    const path = join(import.meta.dir, "..", "..", "package.json")
    return JSON.parse(readFileSync(path, "utf-8")).version
  } catch {
    return "dev"
  }
})()

/**
 * Compare two semver version strings to determine if `latestVersion` is newer than `currentVersion`.
 * Only compares numeric major.minor.patch — pre-release suffixes cause the version to be treated as
 * older than the equivalent release (e.g. "1.0.0-beta.1" < "1.0.0").
 *
 * @param currentVersion - The currently running version string
 * @param latestVersion - The version to compare against
 * @returns true if latestVersion is strictly newer than currentVersion
 */
export function isNewerVersion(currentVersion: string, latestVersion: string): boolean {
  const parse = (v: string): { major: number, minor: number, patch: number, prerelease: boolean } | null => {
    const clean = v.replace(/^v/, "")
    const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/)
    if (!match) return null
    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
      prerelease: match[4] !== "",
    }
  }

  const current = parse(currentVersion)
  const latest = parse(latestVersion)
  if (!current || !latest) return false

  if (latest.major !== current.major) return latest.major > current.major
  if (latest.minor !== current.minor) return latest.minor > current.minor
  if (latest.patch !== current.patch) return latest.patch > current.patch

  // Same major.minor.patch — prerelease is older than release
  if (current.prerelease && !latest.prerelease) return true

  return false
}

// ── Update Check ────────────────────────────

/** Information about an available update. */
export interface UpdateInfo {
  latestVersion: string
  latestUrl: string
  releasedAt: string
}

interface CachedUpdateCheck {
  checkedAt: string
  update: UpdateInfo | null
}

const CACHE_DIR = join(homedir(), ".config", "vault0")
const CACHE_FILE = join(CACHE_DIR, "version-check.json")
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Check GitHub for a newer release. Returns UpdateInfo if a newer version exists, null otherwise.
 * Caches the result to disk. Silently returns null on any error.
 *
 * @param cachePath - Override cache file path (for testing)
 */
export async function checkForUpdate(cachePath?: string): Promise<UpdateInfo | null> {
  const filePath = cachePath ?? CACHE_FILE
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(
      "https://api.github.com/repos/getdotweb/vault0/releases/latest",
      {
        signal: controller.signal,
        headers: { "Accept": "application/vnd.github+json" },
      },
    )
    clearTimeout(timeout)

    if (!response.ok) return null

    const data = await response.json() as { tag_name?: string, html_url?: string, published_at?: string }
    const tagName = data.tag_name
    const htmlUrl = data.html_url
    const publishedAt = data.published_at

    if (!tagName || !htmlUrl || !publishedAt) return null

    const latestVersion = tagName.replace(/^v/, "")
    const update: UpdateInfo | null = isNewerVersion(VERSION, latestVersion)
      ? { latestVersion, latestUrl: htmlUrl, releasedAt: publishedAt }
      : null

    // Write cache
    const cached: CachedUpdateCheck = { checkedAt: new Date().toISOString(), update }
    try {
      mkdirSync(filePath.substring(0, filePath.lastIndexOf("/")), { recursive: true })
      writeFileSync(filePath, JSON.stringify(cached))
    } catch { /* cache write failure is non-fatal */ }

    return update
  } catch {
    return null
  }
}

/**
 * Read cached update info from disk. Returns null if cache is missing, stale (>24h), or unreadable.
 *
 * @param cachePath - Override cache file path (for testing)
 */
export function getCachedUpdateInfo(cachePath?: string): UpdateInfo | null {
  const filePath = cachePath ?? CACHE_FILE
  try {
    const raw = readFileSync(filePath, "utf-8")
    const cached = JSON.parse(raw) as CachedUpdateCheck
    if (!cached.checkedAt) return null

    const age = Date.now() - new Date(cached.checkedAt).getTime()
    if (age > CACHE_MAX_AGE_MS) return null

    return cached.update ?? null
  } catch {
    return null
  }
}
