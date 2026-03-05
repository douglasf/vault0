import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { VERSION, isNewerVersion, checkForUpdate, getCachedUpdateInfo } from "../lib/version.js"
import type { UpdateInfo } from "../lib/version.js"

/** Swap globalThis.fetch with a mock, run fn, then restore. */
async function withMockFetch(
  impl: () => Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch
  // Use Object.defineProperty to bypass strict typing on fetch.preconnect
  Object.defineProperty(globalThis, "fetch", { value: impl, writable: true, configurable: true })
  try {
    await fn()
  } finally {
    Object.defineProperty(globalThis, "fetch", { value: original, writable: true, configurable: true })
  }
}

describe("version", () => {
  describe("VERSION constant", () => {
    test("resolves to a non-empty string", () => {
      expect(typeof VERSION).toBe("string")
      expect(VERSION.length).toBeGreaterThan(0)
    })

    test("resolves to a valid semver or 'dev' in dev mode", () => {
      const isSemver = /^\d+\.\d+\.\d+/.test(VERSION)
      const isDev = VERSION === "dev"
      expect(isSemver || isDev).toBe(true)
    })
  })

  describe("isNewerVersion", () => {
    test("returns true when latest has higher major version", () => {
      expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true)
    })

    test("returns true when latest has higher minor version", () => {
      expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true)
    })

    test("returns true when latest has higher patch version", () => {
      expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true)
    })

    test("returns false when versions are equal", () => {
      expect(isNewerVersion("1.2.3", "1.2.3")).toBe(false)
    })

    test("returns false when current is newer", () => {
      expect(isNewerVersion("2.0.0", "1.9.9")).toBe(false)
    })

    test("handles v-prefixed versions", () => {
      expect(isNewerVersion("v1.0.0", "v1.0.1")).toBe(true)
      expect(isNewerVersion("v1.0.1", "v1.0.0")).toBe(false)
    })

    test("returns true when current is prerelease and latest is release (same version)", () => {
      expect(isNewerVersion("1.0.0-beta.1", "1.0.0")).toBe(true)
    })

    test("returns false when both are same version with prerelease", () => {
      expect(isNewerVersion("1.0.0-beta.1", "1.0.0-beta.2")).toBe(false)
    })

    test("returns false for non-semver strings", () => {
      expect(isNewerVersion("dev", "1.0.0")).toBe(false)
      expect(isNewerVersion("1.0.0", "dev")).toBe(false)
      expect(isNewerVersion("dev", "dev")).toBe(false)
    })

    test("returns false when latest is prerelease of a higher version", () => {
      // 1.0.0 -> 1.1.0-rc.1 is still newer by minor
      expect(isNewerVersion("1.0.0", "1.1.0-rc.1")).toBe(true)
    })

    test("handles large version numbers", () => {
      expect(isNewerVersion("99.99.99", "100.0.0")).toBe(true)
    })
  })
})

// ── Update Check Tests ────────────────────────────

describe("checkForUpdate", () => {
  let testDir: string
  let cachePath: string

  beforeEach(() => {
    testDir = join(tmpdir(), `vault0-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
    cachePath = join(testDir, "version-check.json")
  })

  afterEach(() => {
    try { rmSync(testDir, { recursive: true }) } catch { /* already gone */ }
  })

  test("returns null on network timeout", async () => {
    await withMockFetch(
      () => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      async () => {
        const result = await checkForUpdate(cachePath)
        expect(result).toBeNull()
      },
    )
  })

  test("returns null on JSON parse error from API", async () => {
    await withMockFetch(
      () => Promise.resolve(new Response("not json {{{")),
      async () => {
        const result = await checkForUpdate(cachePath)
        expect(result).toBeNull()
      },
    )
  })

  test("returns UpdateInfo when newer version available", async () => {
    await withMockFetch(
      () => Promise.resolve(new Response(JSON.stringify({
        tag_name: "v99.0.0",
        html_url: "https://github.com/getdotweb/vault0/releases/tag/v99.0.0",
        published_at: "2026-03-01T00:00:00Z",
      }))),
      async () => {
        const result = await checkForUpdate(cachePath)
        expect(result).toEqual({
          latestVersion: "99.0.0",
          latestUrl: "https://github.com/getdotweb/vault0/releases/tag/v99.0.0",
          releasedAt: "2026-03-01T00:00:00Z",
        })
      },
    )
  })

  test("returns null when no newer version available", async () => {
    await withMockFetch(
      () => Promise.resolve(new Response(JSON.stringify({
        tag_name: "v0.0.1",
        html_url: "https://github.com/getdotweb/vault0/releases/tag/v0.0.1",
        published_at: "2020-01-01T00:00:00Z",
      }))),
      async () => {
        const result = await checkForUpdate(cachePath)
        expect(result).toBeNull()
      },
    )
  })

  test("writes cache file after successful check", async () => {
    await withMockFetch(
      () => Promise.resolve(new Response(JSON.stringify({
        tag_name: "v99.0.0",
        html_url: "https://github.com/getdotweb/vault0/releases/tag/v99.0.0",
        published_at: "2026-03-01T00:00:00Z",
      }))),
      async () => {
        await checkForUpdate(cachePath)
        const cached = getCachedUpdateInfo(cachePath)
        expect(cached).toEqual({
          latestVersion: "99.0.0",
          latestUrl: "https://github.com/getdotweb/vault0/releases/tag/v99.0.0",
          releasedAt: "2026-03-01T00:00:00Z",
        })
      },
    )
  })
})

describe("getCachedUpdateInfo", () => {
  let testDir: string
  let cachePath: string

  beforeEach(() => {
    testDir = join(tmpdir(), `vault0-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
    cachePath = join(testDir, "version-check.json")
  })

  afterEach(() => {
    try { rmSync(testDir, { recursive: true }) } catch { /* already gone */ }
  })

  test("returns null when cache file does not exist", () => {
    const result = getCachedUpdateInfo(join(testDir, "nonexistent.json"))
    expect(result).toBeNull()
  })

  test("returns UpdateInfo from fresh cache", () => {
    const cached = {
      checkedAt: new Date().toISOString(),
      update: { latestVersion: "2.0.0", latestUrl: "https://example.com", releasedAt: "2026-01-01T00:00:00Z" },
    }
    writeFileSync(cachePath, JSON.stringify(cached))
    const result = getCachedUpdateInfo(cachePath)
    expect(result).toEqual({ latestVersion: "2.0.0", latestUrl: "https://example.com", releasedAt: "2026-01-01T00:00:00Z" })
  })

  test("returns null from stale cache (older than 24 hours)", () => {
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    const cached = {
      checkedAt: staleDate,
      update: { latestVersion: "2.0.0", latestUrl: "https://example.com", releasedAt: "2026-01-01T00:00:00Z" },
    }
    writeFileSync(cachePath, JSON.stringify(cached))
    const result = getCachedUpdateInfo(cachePath)
    expect(result).toBeNull()
  })

  test("returns null when cache file contains invalid JSON", () => {
    writeFileSync(cachePath, "not valid json {{{")
    const result = getCachedUpdateInfo(cachePath)
    expect(result).toBeNull()
  })

  test("returns null when cache has no update (null update field)", () => {
    const cached = { checkedAt: new Date().toISOString(), update: null }
    writeFileSync(cachePath, JSON.stringify(cached))
    const result = getCachedUpdateInfo(cachePath)
    expect(result).toBeNull()
  })
})
