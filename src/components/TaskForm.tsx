import React, { useState, useRef, useCallback } from "react"
import { TextAttributes } from "@opentui/core"
import type { KeyEvent } from "@opentui/core"
import type { InputRenderable, TextareaRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import type { Task, Priority, Status, TaskType } from "../lib/types.js"
import { PRIORITY_LABELS, TASK_TYPE_LABELS, TASK_TYPES } from "../lib/constants.js"
import { getPriorityColor, getStatusColor, getTaskTypeColor, theme } from "../lib/theme.js"

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
  const titleRef = useRef<InputRenderable>(null)
  const descRef = useRef<TextareaRenderable>(null)
  const [priority, setPriority] = useState<Priority>((task?.priority as Priority) || "normal")
  const [taskType, setTaskType] = useState<TaskType | null>((task?.type as TaskType) || null)
  const [status, setStatus] = useState<Status>((task?.status as Status) || "backlog")
  const [focusField, setFocusField] = useState<FormField>("title")

  const fields: FormField[] = mode === "create"
    ? ["title", "description", "priority", "type", "status", "submit"]
    : ["title", "description", "priority", "type", "submit"]

  const advanceField = useCallback((from?: FormField) => {
    const currentIndex = fields.indexOf(from || focusField)
    if (currentIndex < fields.length - 1) {
      setFocusField(fields[currentIndex + 1])
    }
  }, [focusField, fields])

  const handleTitleSubmit = useCallback(() => {
    // Enter on title → advance to next field
    advanceField("title")
  }, [advanceField])

  const handleFormSubmit = useCallback(() => {
    const titleValue = titleRef.current?.value?.trim() || ""
    const descValue = descRef.current?.editBuffer?.getText() || ""
    if (titleValue) {
      onSubmit({ title: titleValue, description: descValue, priority, status, type: taskType })
    }
  }, [onSubmit, priority, status, taskType])

  useKeyboard((event: KeyEvent) => {
    if (event.name === "escape") {
      onCancel()
      return
    }

    // Tab / Shift+Tab to navigate fields
    if (event.name === "tab") {
      const currentIndex = fields.indexOf(focusField)
      const nextIndex = event.shift
        ? (currentIndex - 1 + fields.length) % fields.length
        : (currentIndex + 1) % fields.length
      setFocusField(fields[nextIndex])
      return
    }

    // Enter on submit button
    if (event.name === "return" && focusField === "submit") {
      handleFormSubmit()
      return
    }

    // Priority cycling with arrow keys
    if (focusField === "priority") {
      if (event.name === "left" || event.name === "up") {
        setPriority((prev) => {
          const idx = PRIORITIES.indexOf(prev)
          return PRIORITIES[(idx - 1 + PRIORITIES.length) % PRIORITIES.length]
        })
      } else if (event.name === "right" || event.name === "down") {
        setPriority((prev) => {
          const idx = PRIORITIES.indexOf(prev)
          return PRIORITIES[(idx + 1) % PRIORITIES.length]
        })
      } else if (event.name === "return") {
        advanceField()
      }
      return
    }

    // Task type cycling with arrow keys
    if (focusField === "type") {
      if (event.name === "left" || event.name === "up") {
        setTaskType((prev) => {
          const idx = TYPE_OPTIONS.indexOf(prev)
          return TYPE_OPTIONS[(idx - 1 + TYPE_OPTIONS.length) % TYPE_OPTIONS.length]
        })
      } else if (event.name === "right" || event.name === "down") {
        setTaskType((prev) => {
          const idx = TYPE_OPTIONS.indexOf(prev)
          return TYPE_OPTIONS[(idx + 1) % TYPE_OPTIONS.length]
        })
      } else if (event.name === "return") {
        advanceField()
      }
      return
    }

    // Status cycling with arrow keys (create mode only)
    if (focusField === "status") {
      if (event.name === "left" || event.name === "up") {
        setStatus((prev) => {
          const idx = STATUSES.indexOf(prev)
          return STATUSES[(idx - 1 + STATUSES.length) % STATUSES.length]
        })
      } else if (event.name === "right" || event.name === "down") {
        setStatus((prev) => {
          const idx = STATUSES.indexOf(prev)
          return STATUSES[(idx + 1) % STATUSES.length]
        })
      } else if (event.name === "return") {
        advanceField()
      }
      return
    }
  })

  const isTitleFocused = focusField === "title"
  const isDescFocused = focusField === "description"

  return (
    <box flexDirection="column" paddingX={2}>
      <text attributes={TextAttributes.BOLD} fg={theme.blue}>
        {mode === "create" ? (parentTitle ? "Create Subtask" : "Create Task") : "Edit Task"}
      </text>
      {parentTitle && (
        <text fg={theme.dim_0}>Parent: {parentTitle}</text>
      )}

      <text> </text>
      <box flexDirection="row">
        <text fg={isTitleFocused ? theme.blue : theme.fg_0}>
          {isTitleFocused ? "\u25B8 " : "  "}Title:{" "}
        </text>
        <input
          ref={titleRef}
          focused={isTitleFocused}
          value={task?.title?.replace(/\t/g, "    ") || ""}
          textColor={isTitleFocused ? theme.fg_0 : theme.dim_0}
          onSubmit={handleTitleSubmit}
          flexGrow={1}
        />
      </box>

      <text> </text>
      <text fg={isDescFocused ? theme.blue : theme.fg_0}>
        {isDescFocused ? "\u25B8 " : "  "}Description:
      </text>
      <box paddingLeft={2}>
        <textarea
          ref={descRef}
          focused={isDescFocused}
          initialValue={task?.description?.replace(/\t/g, "    ") || ""}
          textColor={isDescFocused ? theme.fg_0 : theme.dim_0}
          wrapMode="word"
          height={DESC_VIEWPORT}
          flexGrow={1}
        />
      </box>

      <text> </text>
      <text>
        <span fg={focusField === "priority" ? theme.blue : theme.fg_0}>
          {focusField === "priority" ? "\u25B8 " : "  "}Priority:{" "}
        </span>
        <span fg={getPriorityColor(priority)}>
          {"\u25C0 "}{PRIORITY_LABELS[priority]}{" \u25B6"}
        </span>
      </text>

      <text> </text>
      <text>
        <span fg={focusField === "type" ? theme.blue : theme.fg_0}>
          {focusField === "type" ? "\u25B8 " : "  "}Type:{" "}
        </span>
        <span fg={taskType ? getTaskTypeColor(taskType) : theme.dim_0}>
          {"\u25C0 "}{taskType ? TASK_TYPE_LABELS[taskType] : "None"}{" \u25B6"}
        </span>
      </text>

      {mode === "create" && (
        <>
          <text> </text>
           <text>
            <span fg={focusField === "status" ? theme.blue : theme.fg_0}>
              {focusField === "status" ? "\u25B8 " : "  "}Status:{" "}
            </span>
            <span fg={getStatusColor(status)}>
              {"\u25C0 "}{STATUS_DISPLAY[status] || status}{" \u25B6"}
            </span>
          </text>
        </>
      )}

      <text> </text>
      <text> </text>
      <text
        fg={focusField === "submit" ? theme.bg_1 : theme.fg_0}
        bg={focusField === "submit" ? theme.blue : undefined}
      >
        {focusField === "submit" ? "\u25B8 " : "  "}
        [{mode === "create" ? "Create" : "Save"}]
      </text>

      <text> </text>
      <text fg={theme.dim_0}>Tab: next field  Shift+Tab: prev  Enter: newline (desc) / next  Esc: cancel</text>
      <text fg={theme.dim_0}>Ctrl: A start  E end  U clear left  K clear right  W del word  Del fwd-del</text>
    </box>
  )
}
