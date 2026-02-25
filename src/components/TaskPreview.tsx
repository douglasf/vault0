import { TextAttributes } from "@opentui/core"
import type { Task } from "../lib/types.js"
import { getStatusLabel, getPriorityLabel, getTypeLabel } from "../lib/format.js"
import { getPriorityColor, getStatusColor, getTaskTypeColor } from "../lib/theme.js"
import { theme, getMarkdownSyntaxStyle } from "../lib/theme.js"

// ── Constants ───────────────────────────────────────────────────────

/** Lines consumed by chrome (title + status/priority + margin before description). */
const CHROME_LINES = 3

/** Default height when maxHeight is not provided in bottom orientation. */
const DEFAULT_BOTTOM_HEIGHT = 8

/** Default max description lines for side orientation. */
const DESC_LINES_SIDE = 5

/** Fixed width for side panel. */
const SIDE_PANEL_WIDTH = 40

// ── Layout helpers ──────────────────────────────────────────────────

/** Returns orientation-specific box props for the outer container. */
function getContainerProps(orientation: TaskPreviewProps["orientation"], maxHeight?: number) {
  return orientation === "bottom"
    ? { width: "100%" as const, height: maxHeight, marginTop: 1 }
    : { width: SIDE_PANEL_WIDTH, flexShrink: 0, flexGrow: 0 }
}

/** Computes max height available for the description block. */
function getDescriptionMaxHeight(
  orientation: TaskPreviewProps["orientation"],
  maxHeight?: number,
): number {
  if (orientation === "bottom") {
    return Math.max(1, (maxHeight ?? DEFAULT_BOTTOM_HEIGHT) - CHROME_LINES)
  }
  return DESC_LINES_SIDE
}

// ── Component ───────────────────────────────────────────────────────

export interface TaskPreviewProps {
  task: Task | undefined
  /** Maximum height in terminal lines (used for bottom orientation). */
  maxHeight?: number
  /** Layout orientation — bottom panel or right side panel. */
  orientation: "bottom" | "side"
}

/**
 * Displays a compact preview of a single task, showing title, status/priority
 * badges, and a word-wrapped description excerpt.
 *
 * Used in hover/focus states within the task list. Supports both bottom-panel
 * and side-panel orientations.
 */
export function TaskPreview({ task, maxHeight, orientation }: TaskPreviewProps) {
  const containerProps = getContainerProps(orientation, maxHeight)

  if (!task) {
    return (
      <box
        flexDirection="column"
        backgroundColor={theme.bg_0}
        paddingX={1}
        {...containerProps}
      >
        <box justifyContent="center" flexGrow={1} alignItems="center">
          <text fg={theme.fg_0} attributes={TextAttributes.ITALIC}>No task selected</text>
        </box>
      </box>
    )
  }

  const priorityLabel = getPriorityLabel(task.priority)
  const priorityColor = getPriorityColor(task.priority)
  const statusLabel = getStatusLabel(task.status)
  const statusColor = getStatusColor(task.status)
  const typeLabel = getTypeLabel(task.type)
  const typeColor = task.type ? getTaskTypeColor(task.type) : undefined

  const descMaxHeight = getDescriptionMaxHeight(orientation, maxHeight)

  return (
    <box
      flexDirection="column"
      backgroundColor={theme.bg_0}
      paddingX={1}
      {...containerProps}
    >
      {/* Title */}
      <text attributes={TextAttributes.BOLD} truncate={true} fg={theme.fg_1}>
        {task.title}
      </text>

      {/* Status + Priority + Type badges */}
      <box flexDirection="row" gap={1}>
        <text fg={statusColor}>{statusLabel}</text>
        <text fg={theme.fg_0}>│</text>
        <text fg={priorityColor}>{priorityLabel}</text>
        {typeLabel && (
          <>
            <text fg={theme.fg_0}>│</text>
            <text fg={typeColor}>{typeLabel}</text>
          </>
        )}
      </box>

      {/* Description excerpt */}
      {task.description ? (
        <box marginTop={1} height={descMaxHeight} overflow="hidden">
          <markdown content={task.description} syntaxStyle={getMarkdownSyntaxStyle()} conceal={true} />
        </box>
      ) : (
        <box marginTop={1}>
          <text fg={theme.fg_0} attributes={TextAttributes.ITALIC}>No description</text>
        </box>
      )}
    </box>
  )
}
