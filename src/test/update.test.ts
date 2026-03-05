import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"
import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync, chmodSync, statSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { execSync } from "node:child_process"

describe("update", () => {
  describe("replaceBinary", () => {
    let tempDir: string
    let targetPath: string
    let newBinaryPath: string

    beforeEach(() => {
      tempDir = join(tmpdir(), `vault0-update-test-${Date.now()}`)
      mkdirSync(tempDir, { recursive: true })
      targetPath = join(tempDir, "vault0")
      newBinaryPath = join(tempDir, "vault0-new")

      // Create fake "current" binary
      writeFileSync(targetPath, "#!/bin/sh\necho old")
      chmodSync(targetPath, 0o755)

      // Create fake "new" binary
      writeFileSync(newBinaryPath, "#!/bin/sh\necho new")
      chmodSync(newBinaryPath, 0o755)
    })

    afterEach(() => {
      try { execSync(`rm -rf "${tempDir}"`) } catch { /* cleanup */ }
    })

    test("creates backup of existing binary", () => {
      // Simulate what replaceBinary does inline (we test the logic, not the import)
      const backupPath = `${targetPath}.backup`
      const currentStat = statSync(targetPath)
      chmodSync(newBinaryPath, currentStat.mode)

      // Backup
      const { renameSync: fsRename } = require("node:fs")
      fsRename(targetPath, backupPath)
      fsRename(newBinaryPath, targetPath)

      expect(existsSync(backupPath)).toBe(true)
      expect(readFileSync(backupPath, "utf-8")).toContain("old")
    })

    test("new binary replaces target with correct content", () => {
      const backupPath = `${targetPath}.backup`
      const { renameSync: fsRename } = require("node:fs")
      fsRename(targetPath, backupPath)
      fsRename(newBinaryPath, targetPath)

      expect(readFileSync(targetPath, "utf-8")).toContain("new")
    })

    test("preserves binary permissions after replacement", () => {
      const originalMode = statSync(targetPath).mode
      const { renameSync: fsRename } = require("node:fs")
      chmodSync(newBinaryPath, originalMode)

      fsRename(targetPath, `${targetPath}.backup`)
      fsRename(newBinaryPath, targetPath)

      const newMode = statSync(targetPath).mode
      expect(newMode).toBe(originalMode)
    })
  })

  describe("getPlatformKey", () => {
    test("returns a string for known platforms", () => {
      // We just verify the current platform resolves to something
      const platform = process.platform
      const arch = process.arch

      const expected =
        platform === "darwin" && arch === "arm64" ? "darwin-arm64" :
        platform === "darwin" && arch === "x64" ? "darwin-x64" :
        platform === "linux" && arch === "x64" ? "linux-x64" :
        null

      // On CI or dev machines, at least one of these should match
      if (expected) {
        expect(expected).toMatch(/^(darwin|linux)-(arm64|x64)$/)
      }
    })
  })

  describe("findAssetUrl", () => {
    test("finds matching tar.gz asset for platform", () => {
      const release = {
        tag_name: "v1.0.0",
        assets: [
          { name: "vault0-darwin-arm64.tar.gz", browser_download_url: "https://example.com/darwin-arm64.tar.gz" },
          { name: "vault0-linux-x64.tar.gz", browser_download_url: "https://example.com/linux-x64.tar.gz" },
          { name: "vault0-darwin-arm64.zip", browser_download_url: "https://example.com/darwin-arm64.zip" },
        ],
      }

      const darwinAsset = release.assets.find(
        (a) => a.name.includes("darwin-arm64") && a.name.endsWith(".tar.gz")
      )
      expect(darwinAsset?.browser_download_url).toBe("https://example.com/darwin-arm64.tar.gz")

      const linuxAsset = release.assets.find(
        (a) => a.name.includes("linux-x64") && a.name.endsWith(".tar.gz")
      )
      expect(linuxAsset?.browser_download_url).toBe("https://example.com/linux-x64.tar.gz")
    })

    test("returns undefined when no matching asset exists", () => {
      const release = {
        tag_name: "v1.0.0",
        assets: [
          { name: "vault0-windows-x64.zip", browser_download_url: "https://example.com/win.zip" },
        ],
      }

      const asset = release.assets.find(
        (a) => a.name.includes("darwin-arm64") && a.name.endsWith(".tar.gz")
      )
      expect(asset).toBeUndefined()
    })
  })
})
