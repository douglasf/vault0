import { spawnSync } from "node:child_process"

/**
 * Copy text to the system clipboard.
 *
 * Uses the platform-native clipboard command:
 *   - macOS: pbcopy
 *   - Linux: xclip -selection clipboard
 *   - Windows / WSL: clip.exe
 *
 * Returns true if the copy succeeded, false otherwise.
 */
export function copyToClipboard(text: string): boolean {
  try {
    const platform = process.platform
    let cmd: string
    let args: string[]

    if (platform === "darwin") {
      cmd = "pbcopy"
      args = []
    } else if (platform === "linux") {
      cmd = "xclip"
      args = ["-selection", "clipboard"]
    } else if (platform === "win32") {
      cmd = "clip"
      args = []
    } else {
      return false
    }

    const result = spawnSync(cmd, args, {
      input: text,
      timeout: 2000,
    })

    return result.status === 0
  } catch {
    return false
  }
}
