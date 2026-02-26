import type React from "react"
import { useState, useRef, useCallback } from "react"
import type { KeyEvent, ScrollBoxRenderable, InputRenderable, TextareaRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"
import type { Task, Priority, Status, TaskType } from "../lib/types.js"
import { PRIORITY_LABELS, STATUS_LABELS, TASK_TYPE_LABELS, TASK_TYPES, VISIBLE_STATUSES } from "../lib/constants.js"
import { getPriorityColor, getStatusColor, getTaskTypeColor, theme } from "../lib/theme.js"
import { useFormNavigation } from "../hooks/useFormNavigation.js"
import { ModalOverlay } from "./ModalOverlay.js"
import { Button } from "./Button.js"
import { FormInput } from "./FormInput.js"
import { FormTextarea } from "./FormTextarea.js"

/** Form data submitted on create or edit */
export interface TaskFormData {
  title: string
  description: string
  solution: string
  priority: Priority
  status: Status
  type: TaskType | null
}

export interface TaskFormProps {
  mode: "create" | "edit"
  task?: Task
  /** When creating a subtask, the parent task's title (for display) */
  parentTitle?: string
  /** Default status for the new task (defaults to "backlog") */
  initialStatus?: Status
  onSubmit: (data: TaskFormData) => void
  onCancel: () => void
}

type FormField = "title" | "description" | "solution" | "priority" | "type" | "status" | "submit"

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
export function TaskForm({ mode, task, parentTitle, initialStatus, onSubmit, onCancel }: TaskFormProps) {
  const titleRef = useRef<InputRenderable>(null)
  const descRef = useRef<TextareaRenderable>(null)
  const solutionRef = useRef<TextareaRenderable>(null)
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const [priority, setPriority] = useState<Priority>((task?.priority as Priority) || "normal")
  const [taskType, setTaskType] = useState<TaskType | null>((task?.type as TaskType) || null)
  const [status, setStatus] = useState<Status>((task?.status as Status) || initialStatus || "backlog")
  const { height: terminalRows } = useTerminalDimensions()

  // Modal chrome: 4 (modal margin) + 2 (padding) + 2 (title) + 3 (buttons) = 12
  // Parent title line if present: 2 (text + margin)
  const chromeHeight = 11 + (parentTitle ? 2 : 0)
  const fields: FormField[] = mode === "create"
    ? ["title", "description", "priority", "type", "status", "submit"]
    : ["title", "description", "solution", "priority", "type", "submit"]

  const { focusField, setFocusField, advance, retreat, isFocused } = useFormNavigation(fields, "title" as FormField)

  // ── Field heights for scroll calculation ───────────────────────────────
  // Each field's total height including the spacer line before it (except first)
  const FIELD_HEIGHT: Record<FormField, number> = {
    title: 3,          // bordered input(3)
    description: 10,   // bordered textarea(8+2)
    solution: 10,      // bordered textarea(8+2)
    priority: 2,       // cycler(1) + marginBottom(1)
    type: 2,           // cycler(1) + marginBottom(1)
    status: 2,         // cycler(1) + marginBottom(1)
    submit: 0,         // outside scrollbox — not counted
  }

  const contentHeight = fields.reduce((sum, f) => sum + FIELD_HEIGHT[f], 0)
  const availableHeight = Math.max(10, terminalRows - chromeHeight)
  const needsScroll = contentHeight > availableHeight
  const scrollHeight = needsScroll ? availableHeight : contentHeight

  // ── Auto-scroll to keep focused field visible ──────────────────────────
  const scrollToField = useCallback(
    (field: FormField) => {
      if (!scrollRef.current || !scrollHeight) return
      let fieldTop = 0
      for (const f of fields) {
        if (f === field) break
        fieldTop += FIELD_HEIGHT[f]
      }
      const fieldBottom = fieldTop + FIELD_HEIGHT[field]
      const currentScroll = scrollRef.current.scrollTop
      if (fieldTop < currentScroll) {
        scrollRef.current.scrollTo(fieldTop)
      } else if (fieldBottom > currentScroll + scrollHeight) {
        scrollRef.current.scrollTo(fieldBottom - scrollHeight)
      }
    },
    [fields, scrollHeight],
  )

  // Scroll when focus changes
  scrollToField(focusField)

  const handleFormSubmit = useCallback(() => {
    const titleValue = titleRef.current?.value?.trim() || ""
    const descValue = descRef.current?.editBuffer?.getText() || ""
    const solutionValue = solutionRef.current?.editBuffer?.getText() || ""
    if (titleValue) {
      onSubmit({ title: titleValue, description: descValue, solution: solutionValue, priority, status, type: taskType })
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
      advance()
      return true
    }
    return false
  }, [advance])

  useActiveKeyboard((event: KeyEvent) => {
    // Tab / Shift+Tab to navigate fields
    if (event.name === "tab") {
      if (event.shift) {
        retreat()
      } else {
        advance()
      }
      return
    }
    if (event.name === "btab") {
      retreat()
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

  const isTitleFocused = isFocused("title")
  const isDescFocused = isFocused("description")
  const isSolutionFocused = isFocused("solution")

  const modalTitle = mode === "create"
    ? (parentTitle ? "Create Subtask" : "Create Task")
    : "Edit Task"

  return (
    <ModalOverlay onClose={onCancel} size="large" title={modalTitle}>
      {parentTitle && (
        <text marginBottom={1} fg={theme.dim_0}>Parent: {parentTitle}</text>
      )}

      <scrollbox flexGrow={0} flexShrink={1} height={scrollHeight} ref={scrollRef} scrollY focused={false}>
        <box flexDirection="column" flexGrow={0} flexShrink={0}>
          <FormInput
            ref={titleRef}
            focused={isTitleFocused}
            value={task?.title}
            placeholder="Title"
            onMouseDown={() => setFocusField("title")}
            onSubmit={advance}
          />

          <FormTextarea
            ref={descRef}
            focused={isDescFocused}
            initialValue={task?.description?.replace(/\t/g, "  ") || ""}
            placeholder="Description"
            height={DESC_VIEWPORT}
            onMouseDown={() => setFocusField("description")}
          />

          {mode === "edit" && (
            <FormTextarea
              ref={solutionRef}
              focused={isSolutionFocused}
              initialValue={task?.solution?.replace(/\t/g, "  ") || ""}
              placeholder="Solution"
              height={DESC_VIEWPORT}
              onMouseDown={() => setFocusField("solution")}
            />
          )}


          <box
            height={1}
            marginBottom={1}
          >
            <text onMouseDown={() => setFocusField("priority")}>
              <span fg={isFocused("priority") ? theme.blue : theme.fg_0}>
                Priority{" "}
              </span>
              <span fg={getPriorityColor(priority)}>
                {"\u25C0 "}{PRIORITY_LABELS[priority]}{" \u25B6"}
              </span>
            </text>
          </box>

          <box
            height={1}
            marginBottom={1}
          >
            <text onMouseDown={() => setFocusField("type")}>
              <span fg={isFocused("type") ? theme.blue : theme.fg_0}>
                Type{" "}
              </span>
              <span fg={getPriorityColor(taskType ? getTaskTypeColor(taskType) : theme.dim_0)}>
                {"\u25C0 "}{taskType ? TASK_TYPE_LABELS[taskType] : "None"}{" \u25B6"}
              </span>
            </text>
          </box>

          {mode === "create" && (
              <box
                height={1}
                marginBottom={1}
              >
                <text onMouseDown={() => setFocusField("status")}>
                  <span fg={isFocused("status") ? theme.blue : theme.fg_0}>
                    Status{" "}
                  </span>
                  <span fg={getPriorityColor(status)}>
                    {"\u25C0 "}{STATUS_LABELS[status]}{" \u25B6"}
                  </span>
                </text>
              </box>
          )}
        </box>
      </scrollbox>
      <box minHeight={3} marginX={1} alignItems="flex-start">
        <Button
          onPress={handleFormSubmit}
          fg={isFocused("submit") ? theme.blue : theme.fg_0}
          label={mode === "create" ? "Create" : "Save"} />
      </box>
    </ModalOverlay>
  )
}
