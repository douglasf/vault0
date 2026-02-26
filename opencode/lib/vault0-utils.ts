import { execFileSync } from "child_process"
import type { ToolContext } from "@opencode-ai/plugin"

/**
 * Run a vault0 CLI command and return parsed JSON output.
 *
 * @param args - Array of CLI arguments (e.g., ["task", "add", "--title", "..."])
 * @param context - ToolContext from the OpenCode plugin API
 * @returns Object with { success: boolean, data: any, error?: string }
 *
 * The utility automatically:
 * - Sets cwd to context.directory so vault0 finds the repo-local .vault0/vault0.db
 * - Appends `--format json` to get structured output
 * - Parses the JSON response
 * - Catches errors and returns them as { success: false, error: string }
 *
 * Uses execFileSync (not execSync) to avoid shell interpolation issues —
 * arguments with spaces (task titles, directory paths) are passed as
 * individual argv entries, not joined into a shell command string.
 *
 * Note: vault0's --path flag is TUI-only (launches interactive board for a
 * specific directory). CLI commands discover the database via cwd instead.
 */
export function runVault0(
  args: string[],
  context: ToolContext
): { success: boolean; data: any; error?: string } {
  const cmdArgs = [...args, "--format", "json"]
  try {
    const output = execFileSync("vault0", cmdArgs, {
      encoding: "utf-8",
      timeout: 10000,
      cwd: context.directory,
    })
    return { success: true, data: JSON.parse(output.trim()) }
  } catch (err: any) {
    const stderr = err.stderr?.toString() || err.message
    return { success: false, data: null, error: stderr }
  }
}

/**
 * Check if vault0 is available in the current environment.
 * Returns true if the vault0 binary responds to --version.
 *
 * Used by the Architect agent to decide between vault0 task creation and markdown plans.
 */
export function isVault0Available(): boolean {
  try {
    execFileSync("vault0", ["--version"], { encoding: "utf-8", timeout: 5000 })
    return true
  } catch {
    return false
  }
}
