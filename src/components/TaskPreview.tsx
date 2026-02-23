import { TextAttributes } from "@opentui/core"
import type { Task, Priority, Status, TaskType } from "../lib/types.js"
import { STATUS_LABELS, PRIORITY_LABELS, TASK_TYPE_LABELS } from "../lib/constants.js"
import { getPriorityColor, getStatusColor, getTaskTypeColor } from "../lib/theme.js"
import { theme } from "../lib/theme.js"

export interface TaskPreviewProps {
  task: Task | undefined
  /** Maximum height in terminal lines (used for bottom orientation) */
  maxHeight?: number
  /** Layout orientation — bottom panel or right side panel */
  orientation: "bottom" | "side"
}

export function TaskPreview({ task, maxHeight, orientation }: TaskPreviewProps) {
  if (!task) {
    return (
      <box
        flexDirection="column"
        backgroundColor={theme.bg_0}
        paddingX={1}
        {...(orientation === "bottom"
          ? { width: "100%", height: maxHeight, marginTop: 1 }
          : { width: 40, flexShrink: 0 }
        )}
      >
        <box justifyContent="center" flexGrow={1} alignItems="center">
          <text fg={theme.fg_0} attributes={TextAttributes.ITALIC}>No task selected</text>
        </box>
      </box>
    )
  }

  const priorityLabel = PRIORITY_LABELS[task.priority as Priority] || task.priority
  const priorityColor = getPriorityColor(task.priority)
  const statusLabel = STATUS_LABELS[task.status as Status] || task.status
  const statusColor = getStatusColor(task.status)
  const typeLabel = task.type ? (TASK_TYPE_LABELS[task.type as TaskType] || task.type) : null
  const typeColor = task.type ? getTaskTypeColor(task.type) : undefined

  // Calculate available lines for description.
  // Overhead within the box: title (1) +
  // status/priority line (1) + margin before description (1) = 3 lines of chrome.
  const descMaxLines = orientation === "bottom"
    ? Math.max(1, (maxHeight || 8) - 3)
    : 5
  const descMaxWidth = orientation === "side" ? 34 : 70

  const descriptionLines = task.description
    ? wordWrapLines(task.description, descMaxWidth, descMaxLines)
    : []

  return (
    <box
      flexDirection="column"
      backgroundColor={theme.bg_0}
      paddingX={1}
      {...(orientation === "bottom"
        ? { width: "100%", height: maxHeight, marginTop: 1 }
        : { width: 40, flexShrink: 0, flexGrow: 0 }
      )}
    >
      {/* Title */}
      <text attributes={TextAttributes.BOLD} truncate={true} fg={theme.fg_1}>
        {task.title}
      </text>

      {/* Status + Priority + Type on a single compact line */}
      <box gap={1}>
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

      {/* Description */}
      {descriptionLines.length > 0 ? (
        <box flexDirection="column" marginTop={1}>
          {descriptionLines.map((line) => {
            // Use content hash as key — lines won't reorder within a preview
            const lineKey = `${line.length}-${line.substring(0, 30)}`
            return <text key={lineKey} fg={theme.fg_0} truncate={true}>{line}</text>
          })}
        </box>
      ) : (
        <box marginTop={1}>
          <text fg={theme.fg_0} attributes={TextAttributes.ITALIC}>No description</text>
        </box>
      )}
    </box>
  )
}

// ── Utility ─────────────────────────────────────────────────────────

/** Word-wrap text to maxWidth, returning at most maxLines lines. Appends "…" when truncated. */
function wordWrapLines(text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  // Replace tab characters with spaces — tabs render as garbled boxes
  const paragraphs = text.replace(/\t/g, "    ").split("\n")

  for (const para of paragraphs) {
    if (lines.length >= maxLines) break
    if (para.length === 0) {
      lines.push("")
      continue
    }
    if (para.length <= maxWidth) {
      lines.push(para)
      continue
    }
    const words = para.split(" ")
    let current = ""
    for (const word of words) {
      if (lines.length >= maxLines) break
      // Force-break words that are longer than maxWidth
      if (word.length > maxWidth) {
        if (current) {
          lines.push(current)
          current = ""
        }
        for (let i = 0; i < word.length && lines.length < maxLines; i += maxWidth) {
          lines.push(word.slice(i, i + maxWidth))
        }
        continue
      }
      if (current.length + word.length + 1 > maxWidth) {
        lines.push(current)
        current = word
      } else {
        current = current ? `${current} ${word}` : word
      }
    }
    if (current && lines.length < maxLines) {
      lines.push(current)
    }
  }

  // Truncation indicator when description was cut off
  const joinedLength = lines.join("\n").length
  if (lines.length >= maxLines && text.length > joinedLength) {
    const lastLine = lines[lines.length - 1]
    if (lastLine.length >= maxWidth - 2) {
      lines[lines.length - 1] = `${lastLine.substring(0, maxWidth - 2)} …`
    } else {
      lines[lines.length - 1] = `${lastLine} …`
    }
  }

  return lines
}
