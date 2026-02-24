import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// ── Version File Detection ──────────────────────────────────────────

export interface DetectedVersionFile {
  /** Relative filename (e.g., "package.json") */
  file: string
  /** Absolute path to the file */
  path: string
  /** Current version string extracted from the file */
  version: string
}

/** Files to scan for version information, in priority order. */
const VERSION_FILES: { file: string; extract: (content: string) => string | null }[] = [
  {
    file: "package.json",
    extract: (content) => {
      try {
        const parsed = JSON.parse(content)
        return typeof parsed.version === "string" ? parsed.version : null
      } catch { return null }
    },
  },
  {
    file: "pyproject.toml",
    extract: (content) => {
      // Match version = "x.y.z" in [project] or [tool.poetry] sections
      const match = content.match(/^version\s*=\s*"([^"]+)"/m)
      return match?.[1] ?? null
    },
  },
  {
    file: "Cargo.toml",
    extract: (content) => {
      // Match version = "x.y.z" in [package] section
      const match = content.match(/^version\s*=\s*"([^"]+)"/m)
      return match?.[1] ?? null
    },
  },
  {
    file: "pom.xml",
    extract: (content) => {
      // Match top-level <version>x.y.z</version> (not inside <dependency>)
      const match = content.match(/<version>([^<]+)<\/version>/)
      return match?.[1] ?? null
    },
  },
]

/**
 * Detect version files in the given directory.
 * Returns all found version files with their current versions.
 */
export function detectVersionFiles(rootDir: string): DetectedVersionFile[] {
  const found: DetectedVersionFile[] = []

  for (const { file, extract } of VERSION_FILES) {
    const filePath = join(rootDir, file)
    if (!existsSync(filePath)) continue

    try {
      const content = readFileSync(filePath, "utf-8")
      const version = extract(content)
      if (version) {
        found.push({ file, path: filePath, version })
      }
    } catch { /* unreadable file — skip */ }
  }

  return found
}

/**
 * Write a new version to a version file.
 * Handles each file format appropriately.
 */
export function writeVersion(filePath: string, fileName: string, newVersion: string): void {
  const content = readFileSync(filePath, "utf-8")
  let updated: string

  if (fileName === "package.json") {
    const parsed = JSON.parse(content)
    parsed.version = newVersion
    // Detect indent style from original content
    const indent = content.match(/^\s+/m)?.[0] || "  "
    updated = JSON.stringify(parsed, null, indent) + "\n"
  } else if (fileName === "pyproject.toml" || fileName === "Cargo.toml") {
    updated = content.replace(
      /^(version\s*=\s*")([^"]+)(")/m,
      `$1${newVersion}$3`,
    )
  } else if (fileName === "pom.xml") {
    // Replace first <version> occurrence
    let replaced = false
    updated = content.replace(/<version>([^<]+)<\/version>/, () => {
      if (replaced) return `<version>${newVersion}</version>`
      replaced = true
      return `<version>${newVersion}</version>`
    })
  } else {
    throw new Error(`Unsupported version file: ${fileName}`)
  }

  writeFileSync(filePath, updated, "utf-8")
}
