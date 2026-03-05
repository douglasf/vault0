import { execSync } from "node:child_process"
import { chmodSync, copyFileSync, renameSync, unlinkSync, statSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { VERSION, isNewerVersion } from "../lib/version.js"

// ── Constants ───────────────────────────────────────────────────────

const GITHUB_REPO = "douglasf/vault0"
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

// ── Platform Detection ──────────────────────────────────────────────

function getPlatformKey(): string | null {
  const platform = process.platform
  const arch = process.arch

  if (platform === "darwin" && arch === "arm64") return "darwin-arm64"
  if (platform === "darwin" && arch === "x64") return "darwin-x64"
  if (platform === "linux" && arch === "x64") return "linux-x64"

  return null
}

// ── Release Fetching ────────────────────────────────────────────────

interface GitHubAsset {
  name: string
  browser_download_url: string
}

interface GitHubRelease {
  tag_name: string
  assets: GitHubAsset[]
}

async function fetchLatestRelease(): Promise<GitHubRelease> {
  const response = await fetch(GITHUB_API, {
    headers: { "Accept": "application/vnd.github.v3+json" },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch latest release: HTTP ${response.status}`)
  }

  return response.json() as Promise<GitHubRelease>
}

function findAssetUrl(release: GitHubRelease, platformKey: string): string | null {
  const asset = release.assets.find(
    (a) => a.name.includes(platformKey) && a.name.endsWith(".tar.gz")
  )
  return asset?.browser_download_url ?? null
}

// ── Download and Extract ────────────────────────────────────────────

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url, { redirect: "follow" })

  if (!response.ok) {
    throw new Error(`Failed to download: HTTP ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  await Bun.write(destPath, arrayBuffer)
}

function extractBinary(archivePath: string, extractDir: string): string {
  execSync(`tar -xzf "${archivePath}" -C "${extractDir}"`, {
    stdio: ["pipe", "pipe", "pipe"],
  })

  // Look for the vault0 binary at the root of the extracted contents
  const candidates = ["vault0", "vault0.exe"]
  for (const name of candidates) {
    const binPath = join(extractDir, name)
    if (existsSync(binPath)) return binPath
  }

  throw new Error("Could not find vault0 binary in downloaded archive")
}

// ── Atomic Binary Replacement ───────────────────────────────────────

function replaceBinary(newBinaryPath: string, targetPath: string): void {
  const backupPath = `${targetPath}.backup`

  // Preserve permissions from current binary
  const currentStat = statSync(targetPath)
  chmodSync(newBinaryPath, currentStat.mode)

  // Backup current binary
  try {
    renameSync(targetPath, backupPath)
  } catch (err: unknown) {
    // Cross-device fallback
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "EXDEV") {
      copyFileSync(targetPath, backupPath)
      unlinkSync(targetPath)
    } else {
      throw err
    }
  }

  // Replace with new binary
  try {
    renameSync(newBinaryPath, targetPath)
  } catch (err: unknown) {
    // Cross-device fallback
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "EXDEV") {
      copyFileSync(newBinaryPath, targetPath)
      unlinkSync(newBinaryPath)
    } else {
      // Restore backup on failure
      try { renameSync(backupPath, targetPath) } catch { /* best effort */ }
      throw err
    }
  }
}

// ── macOS Codesign ──────────────────────────────────────────────────

function codesignIfDarwin(binaryPath: string): void {
  if (process.platform !== "darwin") return

  try {
    execSync(`codesign -s - "${binaryPath}"`, {
      stdio: ["pipe", "pipe", "pipe"],
    })
  } catch {
    // codesign unavailable or failed — non-fatal
  }
}

// ── Cleanup Helper ──────────────────────────────────────────────────

function cleanupTemp(...paths: string[]): void {
  for (const p of paths) {
    try { unlinkSync(p) } catch { /* already gone */ }
  }
}

// ── Main Entry Point ────────────────────────────────────────────────

/**
 * Self-update vault0 by downloading the latest release from GitHub.
 * Downloads, extracts, and atomically replaces the current binary.
 */
export async function runUpdate(): Promise<void> {
  const execPath = process.execPath

  // Detect platform
  const platformKey = getPlatformKey()
  if (!platformKey) {
    console.error(`Unsupported platform: ${process.platform}-${process.arch}`)
    console.error("Manual update required: https://github.com/douglasf/vault0/releases")
    process.exit(1)
  }

  console.log(`Current version: ${VERSION}`)
  console.log("Checking for updates...")

  // Fetch latest release
  let release: GitHubRelease
  try {
    release = await fetchLatestRelease()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`Failed to check for updates: ${msg}`)
    console.error("Check your network connection and try again.")
    process.exit(1)
  }

  const latestVersion = release.tag_name.replace(/^v/, "")

  // Check if update needed
  if (!isNewerVersion(VERSION, latestVersion)) {
    console.log(`Already up to date (v${VERSION}).`)
    process.exit(0)
  }

  console.log(`New version available: v${latestVersion}`)

  // Find matching asset
  const assetUrl = findAssetUrl(release, platformKey)
  if (!assetUrl) {
    console.error(`No download available for ${platformKey} in release v${latestVersion}`)
    console.error("Manual update required: https://github.com/douglasf/vault0/releases")
    process.exit(1)
  }

  // Set up temp paths
  const tempArchive = join(tmpdir(), `vault0-update-${Date.now()}.tar.gz`)
  const tempExtractDir = join(tmpdir(), `vault0-update-${Date.now()}`)

  try {
    // Download
    console.log(`Downloading v${latestVersion} for ${platformKey}...`)
    try {
      await downloadToFile(assetUrl, tempArchive)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`Failed to download update: ${msg}`)
      console.error("Check your network connection and try again.")
      cleanupTemp(tempArchive)
      process.exit(1)
    }

    // Extract
    try {
      execSync(`mkdir -p "${tempExtractDir}"`)
    } catch { /* dir creation failed */ }

    let newBinaryPath: string
    try {
      newBinaryPath = extractBinary(tempArchive, tempExtractDir)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`Failed to extract update: ${msg}`)
      cleanupTemp(tempArchive)
      try { execSync(`rm -rf "${tempExtractDir}"`) } catch { /* cleanup */ }
      process.exit(1)
    }

    // Replace binary
    console.log(`Replacing binary at ${execPath}...`)
    try {
      replaceBinary(newBinaryPath, execPath)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes("EACCES") || msg.includes("permission")) {
        console.error("Permission denied. Try running with sudo or check file permissions:")
        console.error("  sudo vault0 update")
      } else {
        console.error(`Failed to replace binary: ${msg}`)
      }
      cleanupTemp(tempArchive)
      try { execSync(`rm -rf "${tempExtractDir}"`) } catch { /* cleanup */ }
      process.exit(1)
    }

    // Codesign on macOS
    codesignIfDarwin(execPath)

    // Cleanup temp files
    cleanupTemp(tempArchive)
    try { execSync(`rm -rf "${tempExtractDir}"`) } catch { /* cleanup */ }

    console.log(`Successfully updated to v${latestVersion}!`)
  } catch (error) {
    // Catch-all cleanup
    cleanupTemp(tempArchive)
    try { execSync(`rm -rf "${tempExtractDir}"`) } catch { /* cleanup */ }
    throw error
  }
}
