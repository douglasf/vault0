import React, { useCallback } from "react"
import { TextAttributes } from "@opentui/core"
import type { KeyEvent } from "@opentui/core"
import { theme } from "../lib/theme.js"
import type { DbError, DbErrorKind } from "../lib/db-errors.js"
import { truncateText } from "../lib/format.js"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"

// Re-export so consumers can import from the component barrel
export type { DbError, DbErrorKind } from "../lib/db-errors.js"

// ── Recovery info per error kind ────────────────────────────────────

/** Recovery guidance shown to the user for a specific database error kind. */
interface RecoveryInfo {
  /** Short label displayed in the banner border title */
  title: string
  /** One-line description of what went wrong */
  description: string
  /** Ordered list of suggested recovery actions */
  actions: readonly string[]
}

/** Maximum characters shown for the raw error message before truncating. */
const MAX_ERROR_MESSAGE_LENGTH = 120

/** Map each DbErrorKind to user-facing recovery guidance. */
const RECOVERY_MAP: Record<DbErrorKind, RecoveryInfo> = {
  connection: {
    title: "Database Unavailable",
    description: "The database file could not be found or opened.",
    actions: [
      "Press 'r' to retry (will recreate if missing)",
      "Check that .vault0/ directory exists and is writable",
      "Check file permissions: ls -la .vault0/",
      "Ensure the disk is mounted and accessible",
    ],
  },
  corruption: {
    title: "Database Corrupted",
    description: "The database file is damaged and cannot be read.",
    actions: [
      "Delete .vault0/vault0.db and press 'r' to recreate",
      "Restore from a backup if available",
      "Check disk health for hardware issues",
    ],
  },
  locked: {
    title: "Database Locked",
    description: "Another process is holding a lock on the database.",
    actions: [
      "Press 'r' to retry (lock may have been released)",
      "Close other Vault0 instances or CLI commands",
      "Delete .vault0/tui.lock if the process is stale",
    ],
  },
  unknown: {
    title: "Database Error",
    description: "An unexpected error occurred while accessing the database.",
    actions: [
      "Press 'r' to retry",
      "Check .vault0/error.log for details",
      "Try deleting .vault0/vault0.db and relaunching",
    ],
  },
}

// ── Component ───────────────────────────────────────────────────────

export interface ErrorBannerProps {
  /** The database error to display */
  error: DbError
  /** Called when the user presses 'r' to retry */
  onRetry: () => void
  /** Called when the user presses 'q' or Escape to dismiss */
  onDismiss?: () => void
}

/**
 * Full-width error banner for database errors.
 *
 * Displays a titled border panel with the error description, raw message,
 * suggested recovery actions, and keyboard shortcuts (r = retry, q/Esc = dismiss).
 */
export function ErrorBanner({ error, onRetry, onDismiss }: ErrorBannerProps) {
  const recovery = RECOVERY_MAP[error.kind]

  const handleKey = useCallback(
    (event: KeyEvent) => {
      if (event.raw === "r") {
        onRetry()
      } else if ((event.raw === "q" || event.name === "escape") && onDismiss) {
        onDismiss()
      }
    },
    [onRetry, onDismiss],
  )

  useActiveKeyboard(handleKey)

  return (
    <box
      flexDirection="column"
      width="100%"
      paddingX={1}
      paddingY={0}
      border={true}
      borderStyle="single"
      borderColor={theme.red}
      title={`✖ ${recovery.title}`}
    >
      <box>
        <text fg={theme.fg_0}>{recovery.description}</text>
      </box>

      <box>
        <text fg={theme.dim_0} attributes={TextAttributes.DIM}>
          {truncateText(error.message, MAX_ERROR_MESSAGE_LENGTH)}
        </text>
      </box>

      <box flexDirection="column">
        {recovery.actions.map((action) => (
          <text key={action} fg={theme.yellow}>
            • {action}
          </text>
        ))}
      </box>

      <box>
        <text fg={theme.dim_0}>
          Press <span attributes={TextAttributes.BOLD} fg={theme.cyan}>r</span> to retry
          {onDismiss && (
            <span> | <span attributes={TextAttributes.BOLD} fg={theme.cyan}>q</span> / <span attributes={TextAttributes.BOLD} fg={theme.cyan}>Esc</span> to dismiss</span>
          )}
        </text>
      </box>
    </box>
  )
}
