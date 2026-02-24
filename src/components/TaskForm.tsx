import type React from "react"
import { useState, useRef, useCallback } from "react"
import type { KeyEvent } from "@opentui/core"
import type { InputRenderable, TextareaRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import type { Task, Priority, Status, TaskType } from "../lib/types.js"
import { PRIORITY_LABELS, STATUS_LABELS, TASK_TYPE_LABELS, TASK_TYPES, VISIBLE_STATUSES } from "../lib/constants.js"
import { getPriorityColor, getStatusColor, getTaskTypeColor, theme, toRGBA } from "../lib/theme.js"
import { ModalOverlay } from "./ModalOverlay.js"

/** Form data submitted on create or edit */
export interface TaskFormData {
  title: string
  description: string
  priority: Priority
  status: Status
  type: TaskType | null
}

export interface TaskFormProps {
  mode: "create" | "edit"
  task?: Task
  /** When creating a subtask, the parent task's title (for display) */
  parentTitle?: string
  onSubmit: (data: TaskFormData) => void
  onCancel: () => void
}

type FormField = "title" | "description" | "priority" | "type" | "status" | "submit"

const PRIORITIES: Priority[] = ["low", "normal", "high", "critical"]

/** Type options include null (no type) plus the defined types */
const TYPE_OPTIONS: (TaskType | null)[] = [null, ...TASK_TYPES]

/** Max visible lines in the description viewport before scrolling kicks in */
const DESC_VIEWPORT = 8

/**
 * Cycle through an array of options, wrapping around at boundaries.
 * @param options  The ordered list of values to cycle through
 * @param current  The currently selected value
 * @param delta    +1 for forward, -1 for backward
 */
function cycleOption<T>(options: readonly T[], current: T, delta: 1 | -1): T {
  const idx = options.indexOf(current)
  return options[(idx + delta + options.length) % options.length]
}

/**
 * Modal form for creating or editing a task.
 *
 * Renders text inputs for title and description, plus arrow-key cyclers
 * for priority, type, and (in create mode) status. Tab/Shift+Tab navigates
 * between fields; Enter advances or submits.
 */
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
    advanceField("title")
  }, [advanceField])

  const handleFormSubmit = useCallback(() => {
    const titleValue = titleRef.current?.value?.trim() || ""
    const descValue = descRef.current?.editBuffer?.getText() || ""
    if (titleValue) {
      onSubmit({ title: titleValue, description: descValue, priority, status, type: taskType })
    }
  }, [onSubmit, priority, status, taskType])

  /**
   * Handle arrow-key cycling for a selector field (priority, type, status).
   * Returns true if the event was consumed, false otherwise.
   */
  const handleCyclerKeys = useCallback(<T,>(
    event: KeyEvent,
    options: readonly T[],
    current: T,
    setter: React.Dispatch<React.SetStateAction<T>>,
  ): boolean => {
    if (event.name === "left" || event.name === "up") {
      setter(cycleOption(options, current, -1))
      return true
    }
    if (event.name === "right" || event.name === "down") {
      setter(cycleOption(options, current, 1))
      return true
    }
    if (event.name === "return") {
      advanceField()
      return true
    }
    return false
  }, [advanceField])

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

    // Arrow-key cycling for selector fields
    if (focusField === "priority") {
      handleCyclerKeys(event, PRIORITIES, priority, setPriority)
      return
    }
    if (focusField === "type") {
      handleCyclerKeys(event, TYPE_OPTIONS, taskType, setTaskType)
      return
    }
    if (focusField === "status") {
      handleCyclerKeys(event, VISIBLE_STATUSES, status, setStatus)
      return
    }
  })

  const isTitleFocused = focusField === "title"
  const isDescFocused = focusField === "description"

  const fieldBg = toRGBA(theme.bg_0)
  const fieldFocusedBg = toRGBA(theme.bg_2)

  const modalTitle = mode === "create"
    ? (parentTitle ? "Create Subtask" : "Create Task")
    : "Edit Task"

  return (
    <ModalOverlay onClose={onCancel} size="large" title={modalTitle}>
      <box flexDirection="column">
        {parentTitle && (
          <text fg={theme.dim_0}>Parent: {parentTitle}</text>
        )}

        <text> </text>
        <box
          border={true}
          borderStyle="single"
          borderColor={isTitleFocused ? theme.blue : theme.fg_0}
          title="Title">
          <input
            ref={titleRef}
            focused={isTitleFocused}
            value={task?.title?.replace(/\t/g, "    ") || ""}
            textColor={isTitleFocused ? theme.fg_0 : theme.dim_0}
            paddingX={1}
            onSubmit={handleTitleSubmit}
            flexGrow={1}
          />
        </box>

        <text> </text>
        <box 
          border={true}
          borderStyle="single"
          borderColor={isDescFocused ? theme.blue : theme.fg_0}
          title="Desription">
          <textarea
            ref={descRef}
            focused={isDescFocused}
            initialValue={task?.description?.replace(/\t/g, "    ") || ""}
            textColor={isDescFocused ? theme.fg_0 : theme.dim_0}
            paddingX={1}
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
                {"\u25C0 "}{STATUS_LABELS[status]}{" \u25B6"}
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
      </box>
    </ModalOverlay>
  )
}
