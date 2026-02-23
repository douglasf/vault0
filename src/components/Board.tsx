import React, { useCallback, useEffect, useRef } from "react"
import { Box, useInput } from "ink"
import { Column } from "./Column.js"
import { EmptyBoard } from "./EmptyBoard.js"
import { useDb } from "../lib/db-context.js"
import { useBoard } from "../hooks/useBoard.js"
import { useNavigation } from "../hooks/useNavigation.js"
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
  onMoveTask?: (task: Task, targetStatus: Status) => void
  /** Whether subtasks are globally hidden */
  hideSubtasks?: boolean
  /** Sort field for lane ordering */
  sortField?: SortField
  /** Called when a database error is detected */
  onDbError?: (error: DbError | null) => void
}

export function Board({ boardId, filters, focusTaskId, inputActive, heightReduction, onSelectTask, onHighlightTask, onMoveTask, hideSubtasks, sortField, onDbError }: BoardProps) {
  const db = useDb()
  const { tasksByStatus, readyIds, blockedIds, dbError, refetch } = useBoard(db, boardId, filters, sortField)

  // Report database errors to parent
  useEffect(() => {
    onDbError?.(dbError)
  }, [dbError, onDbError])

  // Helper to filter out subtasks when globally hidden
  const filterCollapsed = useCallback((tasks: TaskCardType[]) =>
    hideSubtasks
      ? tasks.filter((t) => t.parentId === null)
      : tasks, [hideSubtasks])

  // Check if board is empty (no tasks across all visible statuses)
  const totalTasks = Array.from(tasksByStatus.values()).reduce((sum, tasks) => sum + tasks.length, 0)

  // Build row counts per column for navigation boundary clamping (respecting collapsed state)
  const rowCounts = VISIBLE_STATUSES.map((status) => filterCollapsed(tasksByStatus.get(status) || []).length)

  // Compute initial navigation position from focusTaskId (restores position after detail view)
  let initialColumn = 0
  let initialRow = 0
  if (focusTaskId) {
    for (let col = 0; col < VISIBLE_STATUSES.length; col++) {
      const tasks = filterCollapsed(tasksByStatus.get(VISIBLE_STATUSES[col]) || [])
      const rowIndex = tasks.findIndex((t) => t.id === focusTaskId)
      if (rowIndex >= 0) {
        initialColumn = col
        initialRow = rowIndex
        break
      }
    }
  }

  const nav = useNavigation({
    columnCount: VISIBLE_STATUSES.length,
    rowCounts,
    initialColumn,
    initialRow,
  })

  // Track a task that was just moved so we can follow it with the cursor after re-render
  const pendingFocusTaskId = useRef<string | null>(null)

  // After data refreshes, resolve the pending focus task to its new position
  useEffect(() => {
    const taskId = pendingFocusTaskId.current
    if (!taskId) return
    pendingFocusTaskId.current = null
    for (let col = 0; col < VISIBLE_STATUSES.length; col++) {
      const tasks = filterCollapsed(tasksByStatus.get(VISIBLE_STATUSES[col]) || [])
      const rowIndex = tasks.findIndex((t) => t.id === taskId)
      if (rowIndex >= 0) {
        nav.navigateTo(col, rowIndex)
        return
      }
    }
  }, [tasksByStatus, filterCollapsed, nav])

  // Compute the currently highlighted task from navigation position
  const currentColumnTasks = filterCollapsed(tasksByStatus.get(VISIBLE_STATUSES[nav.selectedColumn]) || [])
  const highlightedTask = currentColumnTasks[nav.selectedRow]

  // Report highlighted task to parent when it changes
  useEffect(() => {
    onHighlightTask?.(highlightedTask)
  }, [highlightedTask, onHighlightTask])

  // Keyboard handler for board navigation (disabled when board is empty)
  useInput((input, key) => {
    const moveLeft = input === "<"
    const moveRight = input === ">"

    if (moveLeft) {
      const task = currentColumnTasks[nav.selectedRow]
      if (task && nav.selectedColumn > 0) {
        const targetStatus = VISIBLE_STATUSES[nav.selectedColumn - 1]
        pendingFocusTaskId.current = task.id
        onMoveTask?.(task, targetStatus)
      }
    } else if (moveRight) {
      const task = currentColumnTasks[nav.selectedRow]
      if (task && nav.selectedColumn < VISIBLE_STATUSES.length - 1) {
        const targetStatus = VISIBLE_STATUSES[nav.selectedColumn + 1]
        pendingFocusTaskId.current = task.id
        onMoveTask?.(task, targetStatus)
      }
    } else if (key.leftArrow) nav.navigateLeft()
    else if (key.rightArrow) nav.navigateRight()
    else if (key.upArrow) nav.navigateUp()
    else if (key.downArrow) nav.navigateDown()
    else if (key.return) {
      const selected = nav.selectCurrent()
      if (selected) {
        const tasks = filterCollapsed(tasksByStatus.get(VISIBLE_STATUSES[selected.column]) || [])
        if (tasks[selected.row]) {
          onSelectTask(tasks[selected.row])
        }
      }
    }
  }, { isActive: totalTasks > 0 && inputActive !== false })

  if (totalTasks === 0) {
    return <EmptyBoard />
  }

  return (
    <Box flexDirection="row" flexGrow={1} width="100%" columnGap={1}>
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
        />
      ))}
    </Box>
  )
}
