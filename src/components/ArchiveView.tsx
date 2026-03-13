import { useState, useRef, useCallback } from "react"
import type { ScrollBoxRenderable, TabSelectRenderable, TabSelectOption } from "@opentui/core"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useKeybindScope } from "../hooks/useKeybindScope.js"
import { useKeybind } from "../hooks/useKeybind.js"
import { SCOPE_PRIORITY } from "../lib/keybind-registry.js"
import type { Task, TaskCard as TaskCardType } from "../lib/types.js"
import { theme, getMarkdownSyntaxStyle } from "../lib/theme.js"
import { getStatusLabel, getPriorityLabel, formatDate } from "../lib/format.js"
import { getPriorityColor, getStatusColor } from "../lib/theme.js"
import { TaskCard } from "./TaskCard.js"

// ── Types ───────────────────────────────────────────────────────────

export interface ArchiveViewProps {
  /** All archived + cancelled tasks */
  archiveTasks: Task[]
  /** Fetches subtasks for a given task ID */
  getTaskSubtasks: (taskId: string) => Task[]
  /** Restore a single task */
  onRestoreTask: (taskId: string) => void
  /** Restore all tasks */
  onRestoreAll: () => void
  /** Permanently delete a single task */
  onDeleteTask: (taskId: string) => void
  /** Show delete-all confirmation at App level */
  onShowDeleteAllConfirmation: () => void
  /** Show single-task delete confirmation at App level */
  onShowDeleteConfirmation: (task: Task) => void
  /** Go back to the board */
  onBack: () => void
  /** Whether keyboard input is active */
  inputActive: boolean
}

type Column = "tasks" | "detail"

const MIN_COLS_2COL = 100

// ── Component ───────────────────────────────────────────────────────

/**
 * Full-screen 2-column archive inbox view.
 *
 * **Desktop (>=100 cols):** Left: task list (35%), Right: task detail (65%).
 * **Narrow (<100 cols):** Tab-based navigation between the two panels.
 */
export function ArchiveView({
  archiveTasks,
  getTaskSubtasks,
  onRestoreTask,
  onRestoreAll,
  onDeleteTask,
  onShowDeleteAllConfirmation,
  onShowDeleteConfirmation,
  onBack,
  inputActive,
}: ArchiveViewProps) {
  const { width: terminalCols, height: terminalRows } = useTerminalDimensions()
  const isNarrow = terminalCols < MIN_COLS_2COL

  const tasksScrollRef = useRef<ScrollBoxRenderable>(null)
  const detailScrollRef = useRef<ScrollBoxRenderable>(null)
  const tabRef = useRef<TabSelectRenderable>(null)

  const [activeColumn, setActiveColumn] = useState<Column>("tasks")
  const [selectedTaskIdx, setSelectedTaskIdx] = useState(0)

  const contentHeight = Math.max(3, terminalRows - 6)

  // Derived data
  const selectedTask = archiveTasks[selectedTaskIdx] ?? null
  const selectedTaskSubtasks = selectedTask ? getTaskSubtasks(selectedTask.id) : []

  // ── Navigation helpers ──────────────────────────────────────────

  const handleTabChange = useCallback((index: number) => {
    const cols: Column[] = ["tasks", "detail"]
    setActiveColumn(cols[index])
  }, [])

  const moveToColumn = useCallback((col: Column) => {
    setActiveColumn(col)
    if (isNarrow) {
      const idx = col === "tasks" ? 0 : 1
      tabRef.current?.setSelectedIndex(idx)
    }
  }, [isNarrow])

  const navigateRight = useCallback(() => {
    if (activeColumn === "tasks" && selectedTask) {
      moveToColumn("detail")
    }
  }, [activeColumn, selectedTask, moveToColumn])

  const navigateLeft = useCallback(() => {
    if (activeColumn === "detail") {
      moveToColumn("tasks")
    }
  }, [activeColumn, moveToColumn])

  // ── Keybind scope ──────────────────────────────────────────

  const scope = useKeybindScope("archive", {
    priority: SCOPE_PRIORITY.VIEW,
    active: inputActive,
  })

  // Escape/q — navigate left or close
  useKeybind(scope, ["Escape", "q"], useCallback(() => {
    if (activeColumn !== "tasks") {
      navigateLeft()
      return
    }
    onBack()
  }, [activeColumn, navigateLeft, onBack]))

  // Navigation
  useKeybind(scope, "ArrowUp", useCallback(() => {
    if (activeColumn === "tasks") {
      setSelectedTaskIdx((prev) => {
        const next = Math.max(0, prev - 1)
        if (next !== prev) tasksScrollRef.current?.scrollBy(-1)
        return next
      })
    } else if (activeColumn === "detail") {
      detailScrollRef.current?.scrollBy(-1)
    }
  }, [activeColumn]), { when: archiveTasks.length > 0 })

  useKeybind(scope, "ArrowDown", useCallback(() => {
    if (activeColumn === "tasks") {
      setSelectedTaskIdx((prev) => {
        const next = Math.min(archiveTasks.length - 1, prev + 1)
        if (next !== prev) tasksScrollRef.current?.scrollBy(1)
        return next
      })
    } else if (activeColumn === "detail") {
      detailScrollRef.current?.scrollBy(1)
    }
  }, [activeColumn, archiveTasks.length]), { when: archiveTasks.length > 0 })

  useKeybind(scope, "PageUp", useCallback(() => {
    if (activeColumn === "detail") detailScrollRef.current?.scrollBy(-contentHeight)
  }, [activeColumn, contentHeight]), { when: archiveTasks.length > 0 })

  useKeybind(scope, "PageDown", useCallback(() => {
    if (activeColumn === "detail") detailScrollRef.current?.scrollBy(contentHeight)
  }, [activeColumn, contentHeight]), { when: archiveTasks.length > 0 })

  // Right/Enter/l — navigate right
  useKeybind(scope, ["ArrowRight", "Enter", "l"], useCallback(() => {
    if (activeColumn === "tasks") navigateRight()
  }, [activeColumn, navigateRight]), { when: archiveTasks.length > 0 })

  // Left/h — navigate left
  useKeybind(scope, ["ArrowLeft", "h"], useCallback(() => {
    if (activeColumn === "detail") navigateLeft()
  }, [activeColumn, navigateLeft]), { when: archiveTasks.length > 0 })

  // r — restore task
  useKeybind(scope, "r", useCallback(() => {
    if (selectedTask) {
      onRestoreTask(selectedTask.id)
      if (selectedTaskIdx >= archiveTasks.length - 1) {
        setSelectedTaskIdx(Math.max(0, archiveTasks.length - 2))
      }
      if (archiveTasks.length <= 1) {
        moveToColumn("tasks")
      }
    }
  }, [selectedTask, selectedTaskIdx, archiveTasks.length, onRestoreTask, moveToColumn]), { when: archiveTasks.length > 0, description: "Restore task" })

  // R — restore all
  useKeybind(scope, "R", useCallback(() => {
    if (archiveTasks.length > 0) onRestoreAll()
  }, [archiveTasks.length, onRestoreAll]), { when: archiveTasks.length > 0, description: "Restore all" })

  // x — delete single task (with confirmation)
  useKeybind(scope, "x", useCallback(() => {
    if (selectedTask) onShowDeleteConfirmation(selectedTask)
  }, [selectedTask, onShowDeleteConfirmation]), { when: archiveTasks.length > 0, description: "Delete task" })

  // X — delete all (with confirmation)
  useKeybind(scope, "X", useCallback(() => {
    if (archiveTasks.length > 0) onShowDeleteAllConfirmation()
  }, [archiveTasks.length, onShowDeleteAllConfirmation]), { when: archiveTasks.length > 0, description: "Delete all" })

  // ── Empty state ───────────────────────────────────────────────

  if (archiveTasks.length === 0) {
    return (
      <box flexDirection="column" flexGrow={1} padding={1}>
        <text fg={theme.cyan} attributes={TextAttributes.BOLD}>
          Archive & Cancelled
        </text>
        <text> </text>
        <text fg={theme.dim_0}>
          No archived or cancelled tasks.
        </text>
        <text> </text>
        <text fg={theme.dim_0}>Esc: back to board</text>
      </box>
    )
  }

  // ── Helpers ────────────────────────────────────────────────────

  /** Convert a plain Task into a TaskCard shape for rendering */
  const toTaskCard = (task: Task): TaskCardType => {
    const subs = getTaskSubtasks(task.id)
    return {
      ...task,
      archivedAt: null,
      dependencyCount: 0,
      blockerCount: 0,
      subtaskTotal: subs.length,
      subtaskDone: subs.filter((s) => s.status === "done").length,
      isReady: false,
      isBlocked: false,
    }
  }

  /** Label for task category */
  const categoryLabel = (task: Task): string => {
    if (task.archivedAt) return "⌫"
    if (task.status === "cancelled") return "✕"
    return ""
  }

  /** Context-sensitive keyboard legend text */
  const legendText =
    activeColumn === "tasks" ? "↑/↓: navigate  Enter/→: detail  r: restore  R: restore all  x: delete  X: delete all  Esc/q: board"
      : "↑/↓: scroll  r: restore  x: delete  ←/h: list  Esc/q: back"

  // ── Panel renderers ───────────────────────────────────────────

  const renderTasksPanel = (panelHeight: number, showBorder: boolean) => {
    const archivedCount = archiveTasks.filter((t) => t.archivedAt).length
    const cancelledCount = archiveTasks.filter((t) => !t.archivedAt && t.status === "cancelled").length

    return (
      <box flexDirection="column" flexGrow={showBorder ? undefined : 1} width={showBorder ? "35%" : "100%"} borderStyle={showBorder ? "single" : undefined} borderColor={activeColumn === "tasks" ? theme.cyan : theme.dim_0}>
        <text fg={theme.cyan} attributes={TextAttributes.BOLD} marginLeft={1}>
          Archive & Cancelled ({archiveTasks.length})
        </text>
        <box flexDirection="row" marginLeft={1}>
          {archivedCount > 0 && <text fg={theme.dim_0}>⌫ {archivedCount} archived  </text>}
          {cancelledCount > 0 && <text fg={theme.dim_0}>✕ {cancelledCount} cancelled</text>}
        </box>

        <text fg={theme.dim_0} marginLeft={1}>──────────────────</text>

        <scrollbox ref={tasksScrollRef} scrollY flexGrow={1} height={panelHeight - 5} focused={false}>
          {archiveTasks.map((task, idx) => {
            const isSelected = idx === selectedTaskIdx
            return (
              <box key={task.id} paddingX={1} backgroundColor={isSelected && activeColumn === "tasks" ? theme.bg_2 : undefined}>
                <box flexDirection="row" flexGrow={1} overflow="hidden">
                  <box flexGrow={1} flexShrink={1} flexBasis={0} minWidth={0} overflow="hidden">
                    <TaskCard
                      task={toTaskCard(task)}
                      isSelected={isSelected && activeColumn === "tasks"}
                      isReady={false}
                      isBlocked={false}
                      showParentRef={false}
                    />
                  </box>
                </box>
              </box>
            )
          })}
        </scrollbox>
      </box>
    )
  }

  const renderDetailPanel = (panelHeight: number, showBorder: boolean) => {
    if (!selectedTask) {
      return (
        <box flexDirection="column" flexGrow={1} width={showBorder ? "65%" : "100%"} borderStyle={showBorder ? "single" : undefined} borderColor={theme.dim_0}>
          <text fg={theme.dim_0} marginLeft={1}>Select a task to view details</text>
        </box>
      )
    }

    return (
      <box flexDirection="column" flexGrow={1} width={showBorder ? "65%" : "100%"} borderStyle={showBorder ? "single" : undefined} borderColor={activeColumn === "detail" ? theme.cyan : theme.dim_0}>
        <scrollbox ref={detailScrollRef} scrollY flexGrow={1} height={panelHeight - 2} focused={false}>
          <box flexDirection="column" paddingX={1}>
            {/* Title */}
            <text fg={theme.fg_0} attributes={TextAttributes.BOLD}>
              {selectedTask.title}
            </text>

            {/* Category badge */}
            <box flexDirection="row" marginTop={1}>
              <text fg={theme.dim_0}>Category: </text>
              <text fg={selectedTask.archivedAt ? theme.yellow : theme.red}>
                {selectedTask.archivedAt ? "Archived" : "Cancelled"}
              </text>
            </box>

            {/* Fields */}
            <box flexDirection="row">
              <text fg={theme.dim_0}>Status: </text>
              <text fg={getStatusColor(selectedTask.status)}>
                {getStatusLabel(selectedTask.status)}
              </text>
            </box>
            <box flexDirection="row">
              <text fg={theme.dim_0}>Priority: </text>
              <text fg={getPriorityColor(selectedTask.priority)}>
                {getPriorityLabel(selectedTask.priority)}
              </text>
            </box>
            <box flexDirection="row">
              <text fg={theme.dim_0}>Created: </text>
              <text fg={theme.fg_1}>{formatDate(selectedTask.createdAt)}</text>
            </box>
            <box flexDirection="row">
              <text fg={theme.dim_0}>Updated: </text>
              <text fg={theme.fg_1}>{formatDate(selectedTask.updatedAt)}</text>
            </box>
            {selectedTask.archivedAt && (
              <box flexDirection="row">
                <text fg={theme.dim_0}>Archived: </text>
                <text fg={theme.fg_1}>{formatDate(selectedTask.archivedAt)}</text>
              </box>
            )}

            {/* Description */}
            {selectedTask.description && (
              <>
                <text fg={theme.dim_0} marginTop={1}>──────────────────</text>
                <markdown content={selectedTask.description} syntaxStyle={getMarkdownSyntaxStyle()} conceal={true} />
              </>
            )}

            {/* Subtasks */}
            {selectedTaskSubtasks.length > 0 && (
              <>
                <text fg={theme.blue} attributes={TextAttributes.BOLD} marginTop={1}>
                  Subtasks ({selectedTaskSubtasks.length})
                </text>
                {selectedTaskSubtasks.map((sub) => (
                  <box key={sub.id} flexDirection="row" marginLeft={2}>
                    <text fg={theme.fg_1}>
                      {sub.status === "done" ? "[x] " : "[ ] "}
                    </text>
                    <text fg={sub.status === "done" ? theme.dim_0 : theme.fg_1}>
                      {sub.title}
                    </text>
                  </box>
                ))}
              </>
            )}

          </box>
        </scrollbox>
      </box>
    )
  }

  // ── Narrow layout (tabbed) ────────────────────────────────────

  if (isNarrow) {
    const tabOptions: TabSelectOption[] = [
      { name: "Tasks", description: "", value: "tasks" },
      { name: "Detail", description: "", value: "detail" },
    ]

    return (
      <box flexDirection="column" flexGrow={1} padding={1}>
        <text fg={theme.dim_0} marginBottom={1}>{legendText}</text>
        <tab-select
          ref={tabRef}
          options={tabOptions}
          focused={false}
          onChange={handleTabChange}
          textColor={theme.fg_0}
          selectedTextColor={theme.fg_0}
          showDescription={false}
          showUnderline={true}
          wrapSelection={false}
          justifyContent="center"
          marginBottom={1}
        />

        {activeColumn === "tasks" && renderTasksPanel(contentHeight - 2, false)}
        {activeColumn === "detail" && renderDetailPanel(contentHeight - 2, false)}

      </box>
    )
  }

  // ── Desktop layout (2 columns) ────────────────────────────────

  return (
    <box flexDirection="column" flexGrow={1} padding={1}>
      <text fg={theme.dim_0} marginBottom={1}>{legendText}</text>
      <box flexDirection="row" flexGrow={1} height={contentHeight}>
        {renderTasksPanel(contentHeight, true)}
        {renderDetailPanel(contentHeight, true)}
      </box>
    </box>
  )
}
