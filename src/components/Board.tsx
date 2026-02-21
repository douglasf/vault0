import React, { useEffect } from "react"
import { Box, useInput } from "ink"
import { Column } from "./Column.js"
import { EmptyBoard } from "./EmptyBoard.js"
import { useDb } from "../lib/db-context.js"
import { useBoard } from "../hooks/useBoard.js"
import { useNavigation } from "../hooks/useNavigation.js"
import { VISIBLE_STATUSES } from "../lib/constants.js"
import type { Task, Filters, Status } from "../lib/types.js"

export interface BoardProps {
  boardId: string
  filters?: Filters
  /** When set, the board will focus this task on mount (restoring position after detail view) */
  focusTaskId?: string
  onSelectTask: (task: Task) => void
  onHighlightTask?: (task: Task | undefined) => void
  onMoveTask?: (task: Task, targetStatus: Status) => void
}

export function Board({ boardId, filters, focusTaskId, onSelectTask, onHighlightTask, onMoveTask }: BoardProps) {
  const db = useDb()
  const { tasksByStatus, readyIds, blockedIds } = useBoard(db, boardId, filters)

  // Check if board is empty (no tasks across all visible statuses)
  const totalTasks = Array.from(tasksByStatus.values()).reduce((sum, tasks) => sum + tasks.length, 0)

  // Build row counts per column for navigation boundary clamping
  const rowCounts = VISIBLE_STATUSES.map((status) => (tasksByStatus.get(status) || []).length)

  // Compute initial navigation position from focusTaskId (restores position after detail view)
  let initialColumn = 0
  let initialRow = 0
  if (focusTaskId) {
    for (let col = 0; col < VISIBLE_STATUSES.length; col++) {
      const tasks = tasksByStatus.get(VISIBLE_STATUSES[col]) || []
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

  // Compute the currently highlighted task from navigation position
  const currentColumnTasks = tasksByStatus.get(VISIBLE_STATUSES[nav.selectedColumn]) || []
  const highlightedTask = currentColumnTasks[nav.selectedRow]

  // Report highlighted task to parent after every render
  useEffect(() => {
    onHighlightTask?.(highlightedTask)
  })

  // Keyboard handler for board navigation (disabled when board is empty)
  useInput((input, key) => {
    const moveLeft = input === "<"
    const moveRight = input === ">"

    if (moveLeft) {
      const task = currentColumnTasks[nav.selectedRow]
      if (task && nav.selectedColumn > 0) {
        const targetStatus = VISIBLE_STATUSES[nav.selectedColumn - 1]
        onMoveTask?.(task, targetStatus)
        nav.navigateLeft()
      }
    } else if (moveRight) {
      const task = currentColumnTasks[nav.selectedRow]
      if (task && nav.selectedColumn < VISIBLE_STATUSES.length - 1) {
        const targetStatus = VISIBLE_STATUSES[nav.selectedColumn + 1]
        onMoveTask?.(task, targetStatus)
        nav.navigateRight()
      }
    } else if (key.leftArrow) nav.navigateLeft()
    else if (key.rightArrow) nav.navigateRight()
    else if (key.upArrow) nav.navigateUp()
    else if (key.downArrow) nav.navigateDown()
    else if (key.return) {
      const selected = nav.selectCurrent()
      if (selected) {
        const tasks = tasksByStatus.get(VISIBLE_STATUSES[selected.column]) || []
        if (tasks[selected.row]) {
          onSelectTask(tasks[selected.row])
        }
      }
    }
  }, { isActive: totalTasks > 0 })

  if (totalTasks === 0) {
    return <EmptyBoard />
  }

  return (
    <Box flexDirection="row" flexGrow={1} width="100%">
      {VISIBLE_STATUSES.map((status, colIndex) => (
        <Column
          key={status}
          status={status}
          tasks={tasksByStatus.get(status) || []}
          selectedRow={nav.selectedRow}
          isActive={colIndex === nav.selectedColumn}
          readyIds={readyIds}
          blockedIds={blockedIds}
        />
      ))}
    </Box>
  )
}
