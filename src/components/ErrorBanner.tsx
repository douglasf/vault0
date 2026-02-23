import React from "react"
import { TextAttributes } from "@opentui/core"
import type { KeyEvent } from "@opentui/core"
import { theme } from "../lib/theme.js"
import type { DbError, DbErrorKind } from "../hooks/useBoard.js"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"

// Re-export so consumers can import from the component barrel
export type { DbError, DbErrorKind } from "../hooks/useBoard.js"

// ── Recovery info per error kind ────────────────────────────────────

interface RecoveryInfo {
  title: string
  description: string
  actions: string[]
}

function getRecoveryInfo(kind: DbErrorKind): RecoveryInfo {
  switch (kind) {
    case "connection":
      return {
        title: "Database Unavailable",
        description: "The database file could not be found or opened.",
        actions: [
          "Press 'r' to retry (will recreate if missing)",
          "Check that .vault0/ directory exists and is writable",
          "Check file permissions: ls -la .vault0/",
          "Ensure the disk is mounted and accessible",
        ],
      }
    case "corruption":
      return {
        title: "Database Corrupted",
        description: "The database file is damaged and cannot be read.",
        actions: [
          "Delete .vault0/vault0.db and press 'r' to recreate",
          "Restore from a backup if available",
          "Check disk health for hardware issues",
        ],
      }
    case "locked":
      return {
        title: "Database Locked",
        description: "Another process is holding a lock on the database.",
        actions: [
          "Press 'r' to retry (lock may have been released)",
          "Close other Vault0 instances or CLI commands",
          "Delete .vault0/tui.lock if the process is stale",
        ],
      }
    case "unknown":
      return {
        title: "Database Error",
        description: "An unexpected error occurred while accessing the database.",
        actions: [
          "Press 'r' to retry",
          "Check .vault0/error.log for details",
          "Try deleting .vault0/vault0.db and relaunching",
        ],
      }
  }
}

// ── Component ───────────────────────────────────────────────────────

export interface ErrorBannerProps {
  error: DbError
  /** Called when the user presses 'r' to retry */
  onRetry: () => void
  /** Called when the user presses 'q' to quit */
  onDismiss?: () => void
}

export function ErrorBanner({ error, onRetry, onDismiss }: ErrorBannerProps) {
  const recovery = getRecoveryInfo(error.kind)

  useActiveKeyboard((event: KeyEvent) => {
    if (event.raw === "r") {
      onRetry()
    } else if (event.raw === "q" && onDismiss) {
      onDismiss()
    } else if (event.name === "escape" && onDismiss) {
      onDismiss()
    }
  })

  return (
    <box
      flexDirection="column"
      width="100%"
      paddingX={1}
      paddingY={0}
      border={true}
      borderStyle="single"
      borderColor={theme.red}
    >
      <box>
        <text attributes={TextAttributes.BOLD} fg={theme.red}>
          ✖ {recovery.title}
        </text>
      </box>

      <box marginTop={0}>
        <text fg={theme.fg_0}>{recovery.description}</text>
      </box>

      <box marginTop={0}>
        <text fg={theme.dim_0} attributes={TextAttributes.DIM}>
          {error.message.length > 120
            ? `${error.message.slice(0, 117)}...`
            : error.message}
        </text>
      </box>

      <box flexDirection="column" marginTop={0}>
        {recovery.actions.map((action) => (
          <text key={action} fg={theme.yellow}>
            • {action}
          </text>
        ))}
      </box>

      <box marginTop={0}>
        <text fg={theme.dim_0}>
          Press <text attributes={TextAttributes.BOLD} fg={theme.cyan}>r</text> to retry
          {onDismiss && (
            <text> | <text attributes={TextAttributes.BOLD} fg={theme.cyan}>q</text> to quit</text>
          )}
        </text>
      </box>
    </box>
  )
}
