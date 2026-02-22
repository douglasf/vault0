import React, { useEffect } from "react"
import { Box, Text, useInput } from "ink"
import { Column } from "./Column.js"
import { useDb } from "../lib/db-context.js"
import { useBoard } from "../hooks/useBoard.js"
import { useNavigation } from "../hooks/useNavigation.js"
import { VISIBLE_STATUSES } from "../lib/constants.js"
import { STATUS_LABELS } from "../lib/constants.js"
import { getStatusColor, getStatusBgColor, theme } from "../lib/theme.js"
import type { Task, Filters, Status } from "../lib/types.js"

export interface NarrowTerminalProps {
  boardId: string
  filters?: Filters
  /** When set, the view will focus this task on mount (restoring position after detail view) */
  focusTaskId?: string
  /** Whether keyboard input is active (default true) */
  inputActive?: boolean
  /** Extra lines to subtract from column available height (e.g. preview panel) */
  heightReduction?: number
  onSelectTask: (task: Task) => void
  onHighlightTask?: (task: Task | undefined) => void
  onMoveTask?: (task: Task, targetStatus: Status) => void
}

/**
 * Degraded single-column view for narrow terminals (< 80 columns).
 * Shows one status column at a time with left/right arrows to switch.
 */
export function NarrowTerminal({ boardId, filters, focusTaskId, inputActive, heightReduction, onSelectTask, onHighlightTask, onMoveTask }: NarrowTerminalProps) {
  const db = useDb()
  const { tasksByStatus, readyIds, blockedIds } = useBoard(db, boardId, filters)

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

  // Report highlighted task to parent when it changes
  useEffect(() => {
    onHighlightTask?.(highlightedTask)
  }, [highlightedTask, onHighlightTask])

  // Keyboard handler — same as Board but also handles enter for selection
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
  }, { isActive: inputActive !== false })

  const activeStatus = VISIBLE_STATUSES[nav.selectedColumn]

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      {/* Column tab indicator */}
      <Box justifyContent="center" gap={1} marginBottom={1}>
        {VISIBLE_STATUSES.map((status, i) => (
          <Text
            key={status}
            bold={i === nav.selectedColumn}
            color={i === nav.selectedColumn ? theme.laneText.primary : theme.laneText.muted}
            backgroundColor={i === nav.selectedColumn ? getStatusBgColor(status) : undefined}
            dimColor={i !== nav.selectedColumn}
          >
            {i === nav.selectedColumn ? ` ${STATUS_LABELS[status]} ` : STATUS_LABELS[status]}
          </Text>
        ))}
      </Box>

      {/* Single visible column */}
      <Column
        status={activeStatus}
        tasks={tasksByStatus.get(activeStatus) || []}
        selectedRow={nav.selectedRow}
        isActive={true}
        readyIds={readyIds}
        blockedIds={blockedIds}
        heightReduction={heightReduction}
      />

      <Box marginTop={1} justifyContent="center">
        <Text dimColor>
          {"<"}/{">"}  switch columns {"  "}
          Up/Down navigate {"  "}
          ? help
        </Text>
      </Box>
    </Box>
  )
}
