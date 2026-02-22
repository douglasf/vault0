import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import type { Task, Priority, Status, TaskType } from "../lib/types.js"
import { PRIORITY_LABELS, TASK_TYPE_LABELS, TASK_TYPES } from "../lib/constants.js"
import { getPriorityColor, getStatusColor, getTaskTypeColor, theme } from "../lib/theme.js"
import { useTextInput } from "../hooks/useTextInput.js"

export interface TaskFormProps {
  mode: "create" | "edit"
  task?: Task
  /** When creating a subtask, the parent task's title (for display) */
  parentTitle?: string
  onSubmit: (data: { title: string; description: string; priority: Priority; status: Status; type: TaskType | null }) => void
  onCancel: () => void
}

type FormField = "title" | "description" | "priority" | "type" | "status" | "submit"

const PRIORITIES: Priority[] = ["low", "normal", "high", "critical"]
const STATUSES: Status[] = ["backlog", "todo", "in_progress", "in_review", "done"]

/** Type options include null (no type) plus the three types */
const TYPE_OPTIONS: (TaskType | null)[] = [null, ...TASK_TYPES]

const STATUS_DISPLAY: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
}

/** Max visible lines in the description viewport before scrolling kicks in */
const DESC_VIEWPORT = 8

export function TaskForm({ mode, task, parentTitle, onSubmit, onCancel }: TaskFormProps) {
  const titleInput = useTextInput(task?.title || "", false)
  const descInput = useTextInput(task?.description || "", true)
  const [priority, setPriority] = useState<Priority>((task?.priority as Priority) || "normal")
  const [taskType, setTaskType] = useState<TaskType | null>((task?.type as TaskType) || null)
  const [status, setStatus] = useState<Status>((task?.status as Status) || "backlog")
  const [focusField, setFocusField] = useState<FormField>("title")

  const fields: FormField[] = mode === "create"
    ? ["title", "description", "priority", "type", "status", "submit"]
    : ["title", "description", "priority", "type", "submit"]

  useInput((input, key) => {
    if (key.escape) {
      onCancel()
      return
    }

    // Tab / Shift+Tab to navigate fields
    if (key.tab) {
      const currentIndex = fields.indexOf(focusField)
      const nextIndex = key.shift
        ? (currentIndex - 1 + fields.length) % fields.length
        : (currentIndex + 1) % fields.length
      setFocusField(fields[nextIndex])
      return
    }

    // Enter on submit button
    if (key.return && focusField === "submit") {
      if (titleInput.value.trim()) {
        onSubmit({ title: titleInput.value.trim(), description: descInput.value, priority, status, type: taskType })
      }
      return
    }

    // Text editing for title (single-line: Enter advances to next field)
    if (focusField === "title") {
      if (key.return) {
        const currentIndex = fields.indexOf("title")
        if (currentIndex < fields.length - 1) {
          setFocusField(fields[currentIndex + 1])
        }
        return
      }
      titleInput.handleInput(input, key)
      return
    }

    // Text editing for description (multiline: Enter inserts newline via hook)
    if (focusField === "description") {
      descInput.handleInput(input, key)
      return
    }

    // Priority cycling with arrow keys
    if (focusField === "priority") {
      if (key.leftArrow || key.upArrow) {
        setPriority((prev) => {
          const idx = PRIORITIES.indexOf(prev)
          return PRIORITIES[(idx - 1 + PRIORITIES.length) % PRIORITIES.length]
        })
      } else if (key.rightArrow || key.downArrow) {
        setPriority((prev) => {
          const idx = PRIORITIES.indexOf(prev)
          return PRIORITIES[(idx + 1) % PRIORITIES.length]
        })
      } else if (key.return) {
        const currentIndex = fields.indexOf(focusField)
        if (currentIndex < fields.length - 1) {
          setFocusField(fields[currentIndex + 1])
        }
      }
      return
    }

    // Task type cycling with arrow keys
    if (focusField === "type") {
      if (key.leftArrow || key.upArrow) {
        setTaskType((prev) => {
          const idx = TYPE_OPTIONS.indexOf(prev)
          return TYPE_OPTIONS[(idx - 1 + TYPE_OPTIONS.length) % TYPE_OPTIONS.length]
        })
      } else if (key.rightArrow || key.downArrow) {
        setTaskType((prev) => {
          const idx = TYPE_OPTIONS.indexOf(prev)
          return TYPE_OPTIONS[(idx + 1) % TYPE_OPTIONS.length]
        })
      } else if (key.return) {
        const currentIndex = fields.indexOf(focusField)
        if (currentIndex < fields.length - 1) {
          setFocusField(fields[currentIndex + 1])
        }
      }
      return
    }

    // Status cycling with arrow keys (create mode only)
    if (focusField === "status") {
      if (key.leftArrow || key.upArrow) {
        setStatus((prev) => {
          const idx = STATUSES.indexOf(prev)
          return STATUSES[(idx - 1 + STATUSES.length) % STATUSES.length]
        })
      } else if (key.rightArrow || key.downArrow) {
        setStatus((prev) => {
          const idx = STATUSES.indexOf(prev)
          return STATUSES[(idx + 1) % STATUSES.length]
        })
      } else if (key.return) {
        const currentIndex = fields.indexOf(focusField)
        if (currentIndex < fields.length - 1) {
          setFocusField(fields[currentIndex + 1])
        }
      }
      return
    }
  })

  const isTitleFocused = focusField === "title"
  const isDescFocused = focusField === "description"

  // Terminal-aware width for description to prevent container overflow.
  // RADICAL SIMPLIFICATION: No outer box, no padding, no border, no margin.
  // Only overhead is the 4-char indent prefix ("    ") added inline.
  const termCols = process.stdout.columns || 80
  const descTextWidth = Math.max(10, termCols - 4)

  // Build display lines from tokens: text tokens get word-wrapped,
  // paste tokens render as a single placeholder line.
  const descDisplayLines: Array<{ text: string; isPaste: boolean }> = []
  let cursorDisplayIdx = 0
  let cursorDisplayCol = 0

  const descTokens = descInput.tokens
  for (let ti = 0; ti < descTokens.length; ti++) {
    const token = descTokens[ti]

    if (token.type === "paste") {
      // The entire paste content becomes one placeholder — no extraction,
      // no popping display lines, no special newline handling.
      const lineCount = token.content.split("\n").length
      descDisplayLines.push({
        text: `[Pasted ~${lineCount} line${lineCount === 1 ? "" : "s"}]`,
        isPaste: true,
      })
      continue
    }

    // Text token — skip empty non-cursor tokens to avoid visual noise
    if (token.content === "" && ti !== descInput.cursorTokenIndex) {
      continue
    }

    const logicalLines = token.content.split("\n")
    for (let li = 0; li < logicalLines.length; li++) {
      const line = logicalLines[li]
      const wrapped = wrapWithOffsets(line, descTextWidth)
      for (let wi = 0; wi < wrapped.length; wi++) {
        const part = wrapped[wi]
        const globalIdx = descDisplayLines.length
        descDisplayLines.push({
          text: part.text,
          isPaste: false,
        })
        // Map cursor position: match token index + logical line + wrapped segment
        if (ti === descInput.cursorTokenIndex && li === descInput.tokenCursorLine) {
          const nextOffset = wi < wrapped.length - 1 ? wrapped[wi + 1].offset : line.length + 1
          if (descInput.tokenCursorCol >= part.offset && descInput.tokenCursorCol < nextOffset) {
            cursorDisplayIdx = globalIdx
            cursorDisplayCol = descInput.tokenCursorCol - part.offset
          }
        }
      }
    }
  }

  // Description viewport: scroll to keep cursor visible (in display-line space)
  const descTotalDisplayLines = descDisplayLines.length
  let descScrollStart = 0
  if (isDescFocused && descTotalDisplayLines > DESC_VIEWPORT) {
    descScrollStart = Math.max(0, Math.min(
      cursorDisplayIdx - Math.floor(DESC_VIEWPORT / 2),
      descTotalDisplayLines - DESC_VIEWPORT,
    ))
  }
  const descVisibleLines = descDisplayLines.slice(descScrollStart, descScrollStart + DESC_VIEWPORT)
  const descHasMoreAbove = descScrollStart > 0
  const descHasMoreBelow = descScrollStart + DESC_VIEWPORT < descTotalDisplayLines

  // Title field: no outer box overhead, just prefix "▸ Title: " (9 chars)
  const titleTextWidth = Math.max(10, termCols - 9)

  let titleHStart = 0
  if (isTitleFocused && titleInput.value.length > titleTextWidth) {
    titleHStart = Math.max(0, titleInput.cursor - Math.floor(titleTextWidth * 0.7))
    titleHStart = Math.min(titleHStart, Math.max(0, titleInput.value.length - titleTextWidth))
  }
  const titleVisible = titleInput.value.slice(titleHStart, titleHStart + titleTextWidth)
  const titleAdjCursor = titleInput.cursor - titleHStart

  return (
    <Box flexDirection="column" paddingX={2}>
      <Text bold color={theme.blue}>
        {mode === "create" ? (parentTitle ? "Create Subtask" : "Create Task") : "Edit Task"}
      </Text>
      {parentTitle && (
        <Text color={theme.dim_0}>Parent: {parentTitle}</Text>
      )}

      <Text> </Text>
      <Text color={isTitleFocused ? theme.blue : theme.fg_0}>
        {isTitleFocused ? "\u25B8 " : "  "}Title: {titleVisible.slice(0, isTitleFocused ? titleAdjCursor : titleVisible.length)}
        {isTitleFocused && <Text inverse>{titleVisible[titleAdjCursor] || " "}</Text>}
        {isTitleFocused ? titleVisible.slice(titleAdjCursor + 1) : ""}
      </Text>

      <Text> </Text>
      <Text color={isDescFocused ? theme.blue : theme.fg_0}>
        {isDescFocused ? "\u25B8 " : "  "}Description:
      </Text>

      {(() => {
        // Token-based rendering: text tokens are editable, paste tokens show placeholders.
        // All display lines (from both text and paste tokens) are in a single flat array.
        return (
          <>
            {descHasMoreAbove && (
              <Text color={theme.dim_0} wrap="truncate">  {`↑ ${descScrollStart} more`}</Text>
            )}
            {descInput.value === "" && !isDescFocused ? (
              <Text color={theme.dim_0}>  (empty)</Text>
            ) : (
              descVisibleLines.map((dl, i) => {
                const globalIdx = descScrollStart + i
                const lineKey = `dline-${globalIdx}`

                // Paste placeholder lines: always dim, never have cursor
                if (dl.isPaste) {
                  return (
                    <Text key={lineKey} color={theme.dim_0} wrap="truncate">
                      {"    "}{dl.text}
                    </Text>
                  )
                }

                // Text display lines: may have cursor highlight
                const isActiveLine = isDescFocused && globalIdx === cursorDisplayIdx
                if (isActiveLine) {
                  let before = dl.text.slice(0, cursorDisplayCol)
                  const cursorChar = dl.text[cursorDisplayCol] || " "
                  const after = dl.text.slice(cursorDisplayCol + 1)
                  if (before.length + 1 + after.length > descTextWidth) {
                    before = before.slice(0, Math.max(0, descTextWidth - 1 - after.length))
                  }
                  return (
                    <Text key={lineKey} wrap="truncate" color={theme.fg_0}>
                      {"  "}{before}<Text inverse>{cursorChar}</Text>{after}
                    </Text>
                  )
                }
                return (
                  <Text key={lineKey} wrap="truncate" color={isDescFocused ? theme.fg_0 : theme.dim_0}>
                    {"  "}{dl.text || " "}
                  </Text>
                )
              })
            )}
            {descHasMoreBelow && (
              <Text color={theme.dim_0} wrap="truncate">  {`↓ ${descDisplayLines.length - descScrollStart - DESC_VIEWPORT} more`}</Text>
            )}
          </>
        )
      })()}

      <Text> </Text>
      <Text>
        <Text color={focusField === "priority" ? theme.blue : theme.fg_0}>
          {focusField === "priority" ? "\u25B8 " : "  "}Priority:{" "}
        </Text>
        <Text color={getPriorityColor(priority)}>
          {"\u25C0 "}{PRIORITY_LABELS[priority]}{" \u25B6"}
        </Text>
      </Text>

      <Text> </Text>
      <Text>
        <Text color={focusField === "type" ? theme.blue : theme.fg_0}>
          {focusField === "type" ? "\u25B8 " : "  "}Type:{" "}
        </Text>
        <Text color={taskType ? getTaskTypeColor(taskType) : theme.dim_0}>
          {"\u25C0 "}{taskType ? TASK_TYPE_LABELS[taskType] : "None"}{" \u25B6"}
        </Text>
      </Text>

      {mode === "create" && (
        <>
          <Text> </Text>
          <Text>
            <Text color={focusField === "status" ? theme.blue : theme.fg_0}>
              {focusField === "status" ? "\u25B8 " : "  "}Status:{" "}
            </Text>
            <Text color={getStatusColor(status)}>
              {"\u25C0 "}{STATUS_DISPLAY[status] || status}{" \u25B6"}
            </Text>
          </Text>
        </>
      )}

      <Text> </Text>
      <Text> </Text>
      <Text inverse={focusField === "submit"} color={focusField === "submit" ? theme.blue : theme.fg_0}>
        {focusField === "submit" ? "\u25B8 " : "  "}
        [{mode === "create" ? "Create" : "Save"}]
      </Text>

      <Text> </Text>
      <Text color={theme.dim_0}>Tab: next field  Shift+Tab: prev  Enter: newline (desc) / next  Esc: cancel</Text>
      <Text color={theme.dim_0}>Ctrl: A start  E end  U clear left  K clear right  W del word  Del fwd-del</Text>
    </Box>
  )
}

// ── Utility functions ───────────────────────────────────────────────

/**
 * Word-wrap a single line of text, tracking the character offset where each
 * display line starts in the original text. This enables mapping cursor
 * position from logical line coordinates to display line coordinates.
 *
 * Breaks at word boundaries (spaces) when possible; falls back to hard breaks
 * for words longer than maxWidth.
 */
function wrapWithOffsets(text: string, maxWidth: number): Array<{ text: string; offset: number }> {
  if (text.length <= maxWidth) {
    return [{ text, offset: 0 }]
  }

  const result: Array<{ text: string; offset: number }> = []
  let pos = 0

  while (pos < text.length) {
    const remaining = text.length - pos
    if (remaining <= maxWidth) {
      result.push({ text: text.slice(pos), offset: pos })
      break
    }

    // Scan backward from pos+maxWidth to find the last space for a clean break
    let breakIdx = -1
    for (let i = pos + maxWidth; i > pos; i--) {
      if (text[i] === " ") {
        breakIdx = i
        break
      }
    }

    if (breakIdx <= pos) {
      // No space found within the window — hard break at maxWidth
      result.push({ text: text.slice(pos, pos + maxWidth), offset: pos })
      pos += maxWidth
    } else {
      // Break at the space (the space itself is consumed, not displayed)
      result.push({ text: text.slice(pos, breakIdx), offset: pos })
      pos = breakIdx + 1
    }
  }

  return result.length > 0 ? result : [{ text: "", offset: 0 }]
}
