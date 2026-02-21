import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import type { Task, Priority, Status } from "../lib/types.js"
import { PRIORITY_LABELS } from "../lib/constants.js"
import { getPriorityColor, getStatusColor } from "../lib/theme.js"
import { useTextInput } from "../hooks/useTextInput.js"

export interface TaskFormProps {
  mode: "create" | "edit"
  task?: Task
  /** When creating a subtask, the parent task's title (for display) */
  parentTitle?: string
  onSubmit: (data: { title: string; description: string; priority: Priority; status: Status }) => void
  onCancel: () => void
}

type FormField = "title" | "description" | "priority" | "status" | "submit"

const PRIORITIES: Priority[] = ["low", "normal", "high", "critical"]
const STATUSES: Status[] = ["backlog", "todo", "in_progress", "in_review", "done"]

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
  const [status, setStatus] = useState<Status>((task?.status as Status) || "backlog")
  const [focusField, setFocusField] = useState<FormField>("title")

  const fields: FormField[] = mode === "create"
    ? ["title", "description", "priority", "status", "submit"]
    : ["title", "description", "priority", "submit"]

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
        onSubmit({ title: titleInput.value.trim(), description: descInput.value, priority, status })
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

  // Description viewport: scroll to keep cursor visible
  const descLines = descInput.lines
  const descTotalLines = descLines.length
  const isTitleFocused = focusField === "title"
  const isDescFocused = focusField === "description"

  let descScrollStart = 0
  if (isDescFocused && descTotalLines > DESC_VIEWPORT) {
    descScrollStart = Math.max(0, Math.min(
      descInput.cursorLine - Math.floor(DESC_VIEWPORT / 2),
      descTotalLines - DESC_VIEWPORT,
    ))
  }
  const descVisibleLines = descLines.slice(descScrollStart, descScrollStart + DESC_VIEWPORT)
  const descHasMoreAbove = descScrollStart > 0
  const descHasMoreBelow = descScrollStart + DESC_VIEWPORT < descTotalLines

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Text bold color="cyan">
        {mode === "create" ? (parentTitle ? "Create Subtask" : "Create Task") : "Edit Task"}
      </Text>
      {parentTitle && (
        <Text dimColor>  Parent: {parentTitle}</Text>
      )}

      {/* Title Field — single-line with inverse-video cursor */}
      <Box marginTop={1}>
        <Text color={isTitleFocused ? "cyan" : "white"}>
          {isTitleFocused ? "\u25B8 " : "  "}Title: {titleInput.beforeCursor}
          {isTitleFocused && <Text inverse>{titleInput.afterCursor[0] || " "}</Text>}
          {isTitleFocused ? titleInput.afterCursor.slice(1) : titleInput.afterCursor}
        </Text>
      </Box>

      {/* Description Field — multi-line with cursor and scroll */}
      <Box marginTop={1} flexDirection="column">
        <Text color={isDescFocused ? "cyan" : "white"}>
          {isDescFocused ? "\u25B8 " : "  "}Description:
        </Text>
        <Box
          marginLeft={4}
          borderStyle={isDescFocused ? "round" : "single"}
          borderColor={isDescFocused ? "cyan" : "gray"}
          paddingX={1}
          minHeight={3}
          flexDirection="column"
        >
          {descHasMoreAbove && (
            <Text dimColor>{`\u2191 ${descScrollStart} more`}</Text>
          )}
          {descInput.value === "" && !isDescFocused ? (
            <Text dimColor>(empty)</Text>
          ) : (
            descVisibleLines.map((line, i) => {
              const globalLineIdx = descScrollStart + i
              const lineKey = `line-${globalLineIdx}`
              const isActiveLine = isDescFocused && globalLineIdx === descInput.cursorLine
              if (isActiveLine) {
                const before = line.slice(0, descInput.cursorCol)
                const after = line.slice(descInput.cursorCol)
                return (
                  <Text key={lineKey} color="white">
                    {before}<Text inverse>{after[0] || " "}</Text>{after.slice(1)}
                  </Text>
                )
              }
              return (
                <Text key={lineKey} color={isDescFocused ? "white" : "gray"}>
                  {line || " "}
                </Text>
              )
            })
          )}
          {descHasMoreBelow && (
            <Text dimColor>{`\u2193 ${descTotalLines - descScrollStart - DESC_VIEWPORT} more`}</Text>
          )}
        </Box>
      </Box>

      {/* Priority Field */}
      <Box marginTop={1}>
        <Text color={focusField === "priority" ? "cyan" : "white"}>
          {focusField === "priority" ? "\u25B8 " : "  "}Priority:{" "}
        </Text>
        <Text color={getPriorityColor(priority)}>
          {"\u25C0 "}{PRIORITY_LABELS[priority]}{" \u25B6"}
        </Text>
      </Box>

      {/* Status Field (create only) */}
      {mode === "create" && (
        <Box marginTop={1}>
          <Text color={focusField === "status" ? "cyan" : "white"}>
            {focusField === "status" ? "\u25B8 " : "  "}Status:{" "}
          </Text>
          <Text color={getStatusColor(status)}>
            {"\u25C0 "}{STATUS_DISPLAY[status] || status}{" \u25B6"}
          </Text>
        </Box>
      )}

      {/* Submit Button */}
      <Box marginTop={2}>
        <Text inverse={focusField === "submit"} color={focusField === "submit" ? "cyan" : "white"}>
          {focusField === "submit" ? "\u25B8 " : "  "}
          [{mode === "create" ? "Create" : "Save"}]
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Tab: next field  Shift+Tab: prev  Enter: newline (desc) / next  Esc: cancel</Text>
        <Text dimColor>Ctrl: A start  E end  U clear left  K clear right  W del word  Del fwd-del</Text>
      </Box>
    </Box>
  )
}
