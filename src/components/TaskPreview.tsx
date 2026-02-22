import React from "react"
import { Box, Text } from "ink"
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
      <Box
        flexDirection="column"
        backgroundColor={theme.ui.panelBg}
        paddingX={1}
        {...(orientation === "bottom"
          ? { width: "100%", height: maxHeight, marginTop: 1 }
          : { width: 40, flexShrink: 0 }
        )}
      >
        <Box justifyContent="center" flexGrow={1} alignItems="center">
          <Text dimColor italic>No task selected</Text>
        </Box>
      </Box>
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
    <Box
      flexDirection="column"
      backgroundColor={theme.ui.panelBg}
      paddingX={1}
      {...(orientation === "bottom"
        ? { width: "100%", height: maxHeight, marginTop: 1 }
        : { width: 40, flexShrink: 0, flexGrow: 0 }
      )}
    >
      {/* Title */}
      <Text bold wrap="truncate">
        {task.title}
      </Text>

      {/* Status + Priority + Type on a single compact line */}
      <Box gap={1}>
        <Text color={statusColor}>{statusLabel}</Text>
        <Text dimColor>│</Text>
        <Text color={priorityColor}>{priorityLabel}</Text>
        {typeLabel && (
          <>
            <Text dimColor>│</Text>
            <Text color={typeColor}>{typeLabel}</Text>
          </>
        )}
      </Box>

      {/* Description */}
      {descriptionLines.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {descriptionLines.map((line) => {
            // Use content hash as key — lines won't reorder within a preview
            const lineKey = `${line.length}-${line.substring(0, 30)}`
            return <Text key={lineKey} dimColor wrap="truncate">{line}</Text>
          })}
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text dimColor italic>No description</Text>
        </Box>
      )}
    </Box>
  )
}

// ── Utility ─────────────────────────────────────────────────────────

/** Word-wrap text to maxWidth, returning at most maxLines lines. Appends "…" when truncated. */
function wordWrapLines(text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  const paragraphs = text.split("\n")

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
