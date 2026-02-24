import { useCallback, useEffect, useMemo, useRef } from "react"
import type { KeyEvent } from "@opentui/core"
import { Column } from "./Column.js"
import { EmptyBoard } from "./EmptyBoard.js"
import { useDb } from "../lib/db-context.js"
import { useBoard } from "../hooks/useBoard.js"
import { useNavigation } from "../hooks/useNavigation.js"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"
import { VISIBLE_STATUSES } from "../lib/constants.js"
import type { Task, Filters, Status, SortField, TaskCard as TaskCardType } from "../lib/types.js"
import type { DbError } from "../hooks/useBoard.js"

export interface BoardProps {
  boardId: string
  filters?: Filters
  /** When set, the board will focus this task on mount (restoring position after detail view) */
  focusTaskId?: string
  /** Whether the board's keyboard input is active (default true) */
  inputActive?: boolean
  /** Extra lines to subtract from column available height (e.g. preview panel) */
  heightReduction?: number
  onSelectTask: (task: Task) => void
  onHighlightTask?: (task: Task | undefined) => void
  onHighlightColumn?: (status: Status) => void
  onMoveTask?: (task: Task, targetStatus: Status) => void
  /** Whether subtasks are globally hidden */
  hideSubtasks?: boolean
  /** Sort field for lane ordering */
  sortField?: SortField
  /** When set, the board will navigate to this task after the next data refresh */
  pendingFocusTaskId?: string
  /** Called when a database error is detected */
  onDbError?: (error: DbError | null) => void
}

/**
 * Main kanban board view.
 *
 * Renders {@link VISIBLE_STATUSES} as columns, manages keyboard-driven
 * navigation and task movement between columns via `<` / `>` keys, and
 * supports cursor restoration when returning from the detail view.
 */
export function Board({
  boardId,
  filters,
  focusTaskId,
  inputActive,
  heightReduction,
  onSelectTask,
  onHighlightTask,
  onHighlightColumn,
  onMoveTask,
  hideSubtasks,
  sortField,
  pendingFocusTaskId: pendingFocusTaskIdProp,
  onDbError,
}: BoardProps) {
  const db = useDb()
  const { tasksByStatus, readyIds, blockedIds, dbError } = useBoard(db, boardId, filters, sortField)

  // Report database errors to parent
  useEffect(() => {
    onDbError?.(dbError)
  }, [dbError, onDbError])

  // Helper to filter out subtasks when globally hidden
  const filterCollapsed = useCallback(
    (tasks: TaskCardType[]) => (hideSubtasks ? tasks.filter((t) => t.parentId === null) : tasks),
    [hideSubtasks],
  )

  /** Resolve the visible tasks for a given column status (respecting collapsed state). */
  const getColumnTasks = useCallback(
    (status: Status) => filterCollapsed(tasksByStatus.get(status) || []),
    [filterCollapsed, tasksByStatus],
  )

  // Check if board is empty (no tasks across all visible statuses)
  const totalTasks = useMemo(
    () => Array.from(tasksByStatus.values()).reduce((sum, tasks) => sum + tasks.length, 0),
    [tasksByStatus],
  )

  // Build row counts per column for navigation boundary clamping (respecting collapsed state)
  const rowCounts = useMemo(
    () => VISIBLE_STATUSES.map((status) => getColumnTasks(status).length),
    [getColumnTasks],
  )

  // Compute initial navigation position from focusTaskId (restores position after detail view)
  const { initialColumn, initialRow } = useMemo(() => {
    if (!focusTaskId) return { initialColumn: 0, initialRow: 0 }
    for (let col = 0; col < VISIBLE_STATUSES.length; col++) {
      const rowIndex = getColumnTasks(VISIBLE_STATUSES[col]).findIndex((t) => t.id === focusTaskId)
      if (rowIndex >= 0) return { initialColumn: col, initialRow: rowIndex }
    }
    return { initialColumn: 0, initialRow: 0 }
  }, [focusTaskId, getColumnTasks])

  const nav = useNavigation({
    columnCount: VISIBLE_STATUSES.length,
    rowCounts,
    initialColumn,
    initialRow,
  })

  // Track a task that was just moved so we can follow it with the cursor after re-render
  const pendingFocusTaskId = useRef<string | null>(null)

  // Accept external focus requests (e.g. after task creation)
  useEffect(() => {
    if (pendingFocusTaskIdProp) {
      pendingFocusTaskId.current = pendingFocusTaskIdProp
    }
  }, [pendingFocusTaskIdProp])

  // After data refreshes, resolve the pending focus task to its new position
  useEffect(() => {
    const taskId = pendingFocusTaskId.current
    if (!taskId) return
    pendingFocusTaskId.current = null
    for (let col = 0; col < VISIBLE_STATUSES.length; col++) {
      const rowIndex = getColumnTasks(VISIBLE_STATUSES[col]).findIndex((t) => t.id === taskId)
      if (rowIndex >= 0) {
        nav.navigateTo(col, rowIndex)
        return
      }
    }
  }, [getColumnTasks, nav])

  // Compute the currently highlighted task from navigation position
  const currentColumnTasks = getColumnTasks(VISIBLE_STATUSES[nav.selectedColumn])
  const highlightedTask = currentColumnTasks[nav.selectedRow]

  // Report highlighted task to parent when it changes
  useEffect(() => {
    onHighlightTask?.(highlightedTask)
  }, [highlightedTask, onHighlightTask])

  // Report current column (lane) to parent when it changes
  useEffect(() => {
    onHighlightColumn?.(VISIBLE_STATUSES[nav.selectedColumn])
  }, [nav.selectedColumn, onHighlightColumn])

  /**
   * Move the highlighted task one column in the given direction (-1 = left, +1 = right).
   * Sets up a pending focus so the cursor follows the task after re-render.
   */
  const moveTaskInDirection = useCallback(
    (direction: -1 | 1) => {
      const task = currentColumnTasks[nav.selectedRow]
      const targetCol = nav.selectedColumn + direction
      if (task && targetCol >= 0 && targetCol < VISIBLE_STATUSES.length) {
        pendingFocusTaskId.current = task.id
        onMoveTask?.(task, VISIBLE_STATUSES[targetCol])
      }
    },
    [currentColumnTasks, nav.selectedRow, nav.selectedColumn, onMoveTask],
  )

  // Keyboard handler for board navigation (disabled when board is empty)
  useActiveKeyboard(
    (event: KeyEvent) => {
      const input = event.raw || ""

      if (input === "<") moveTaskInDirection(-1)
      else if (input === ">") moveTaskInDirection(1)
      else if (event.name === "left") nav.navigateLeft()
      else if (event.name === "right") nav.navigateRight()
      else if (event.name === "up") nav.navigateUp()
      else if (event.name === "down") nav.navigateDown()
      else if (event.name === "return") {
        const selected = nav.selectCurrent()
        if (selected) {
          const tasks = getColumnTasks(VISIBLE_STATUSES[selected.column])
          if (tasks[selected.row]) {
            onSelectTask(tasks[selected.row])
          }
        }
      }
    },
    totalTasks > 0 && inputActive !== false,
  )

  if (totalTasks === 0) {
    return <EmptyBoard />
  }

  return (
    <box flexDirection="row" flexGrow={1} width="100%" columnGap={1}>
      {VISIBLE_STATUSES.map((status, colIndex) => (
        <Column
          key={status}
          status={status}
          tasks={tasksByStatus.get(status) || []}
          selectedRow={nav.selectedRow}
          isActive={colIndex === nav.selectedColumn}
          readyIds={readyIds}
          blockedIds={blockedIds}
          heightReduction={heightReduction}
          columnCount={VISIBLE_STATUSES.length}
          hideSubtasks={hideSubtasks}
          onTaskClick={(rowIndex) => nav.navigateTo(colIndex, rowIndex)}
        />
      ))}
    </box>
  )
}
