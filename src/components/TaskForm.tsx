import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import type { Task, Priority, Status } from "../lib/types.js"
import { PRIORITY_LABELS } from "../lib/constants.js"
import { getPriorityColor, getStatusColor } from "../lib/theme.js"

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

export function TaskForm({ mode, task, parentTitle, onSubmit, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState(task?.title || "")
  const [description, setDescription] = useState(task?.description || "")
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
      if (title.trim()) {
        onSubmit({ title: title.trim(), description, priority, status })
      }
      return
    }

    // Text editing for title and description
    if (focusField === "title" || focusField === "description") {
      const setter = focusField === "title" ? setTitle : setDescription

      if (key.backspace || key.delete) {
        setter((prev: string) => prev.slice(0, -1))
      } else if (key.return) {
        // Enter on text fields advances to next field
        const currentIndex = fields.indexOf(focusField)
        if (currentIndex < fields.length - 1) {
          setFocusField(fields[currentIndex + 1])
        }
      } else if (input && !key.ctrl && !key.meta) {
        setter((prev: string) => prev + input)
      }
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

  const cursor = "█"

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Text bold color="cyan">
        {mode === "create" ? (parentTitle ? "Create Subtask" : "Create Task") : "Edit Task"}
      </Text>
      {parentTitle && (
        <Text dimColor>  Parent: {parentTitle}</Text>
      )}

      {/* Title Field */}
      <Box marginTop={1}>
        <Text color={focusField === "title" ? "cyan" : "white"}>
          {focusField === "title" ? "▸ " : "  "}Title: {title}
          {focusField === "title" ? cursor : ""}
        </Text>
      </Box>

      {/* Description Field */}
      <Box marginTop={1} flexDirection="column">
        <Text color={focusField === "description" ? "cyan" : "white"}>
          {focusField === "description" ? "▸ " : "  "}Description:
        </Text>
        <Box
          marginLeft={4}
          borderStyle={focusField === "description" ? "round" : "single"}
          borderColor={focusField === "description" ? "cyan" : "gray"}
          paddingX={1}
          minHeight={5}
          overflow="hidden"
        >
          <Text wrap="wrap" color={focusField === "description" ? "white" : "gray"}>
            {description || (focusField === "description" ? "" : "(empty)")}
            {focusField === "description" ? cursor : ""}
          </Text>
        </Box>
      </Box>

      {/* Priority Field */}
      <Box marginTop={1}>
        <Text color={focusField === "priority" ? "cyan" : "white"}>
          {focusField === "priority" ? "▸ " : "  "}Priority:{" "}
        </Text>
        <Text color={getPriorityColor(priority)}>
          {"◀ "}{PRIORITY_LABELS[priority]}{" ▶"}
        </Text>
      </Box>

      {/* Status Field (create only) */}
      {mode === "create" && (
        <Box marginTop={1}>
          <Text color={focusField === "status" ? "cyan" : "white"}>
            {focusField === "status" ? "▸ " : "  "}Status:{" "}
          </Text>
          <Text color={getStatusColor(status)}>
            {"◀ "}{STATUS_DISPLAY[status] || status}{" ▶"}
          </Text>
        </Box>
      )}

      {/* Submit Button */}
      <Box marginTop={2}>
        <Text inverse={focusField === "submit"} color={focusField === "submit" ? "cyan" : "white"}>
          {focusField === "submit" ? "▸ " : "  "}
          [{mode === "create" ? "Create" : "Save"}]
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Tab: next field  Shift+Tab: prev  Enter: submit/next  Esc: cancel</Text>
      </Box>
    </Box>
  )
}
