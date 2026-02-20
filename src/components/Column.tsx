import React, { useState, useEffect } from "react"
import { Box, Text, useStdout } from "ink"
import { TaskCard } from "./TaskCard.js"
import type { TaskCard as TaskCardType, Status } from "../lib/types.js"
import { STATUS_LABELS } from "../lib/constants.js"
import { getStatusColor } from "../lib/theme.js"

export interface ColumnProps {
  status: Status
  tasks: TaskCardType[]
  selectedRow: number
  isActive: boolean
  readyIds: Set<string>
  blockedIds: Set<string>
}

export function Column({ status, tasks, selectedRow, isActive, readyIds, blockedIds }: ColumnProps) {
  const { stdout } = useStdout()
  const terminalRows = stdout?.rows || 24

  const [scrollOffset, setScrollOffset] = useState(0)

  // Dynamically compute visible rows based on terminal height
  // Reserve ~10 lines for header, column header, borders, scroll indicators, footer
  // Ensure at least 3 rows are always visible
  const maxVisibleRows = Math.max(3, Math.min(terminalRows - 10, 30))
  const visibleTasks = tasks.slice(scrollOffset, scrollOffset + maxVisibleRows)
  const hasMore = tasks.length > scrollOffset + maxVisibleRows

  // Auto-scroll to keep selected row visible when this column is active
  useEffect(() => {
    if (!isActive) return
    if (selectedRow < scrollOffset) {
      setScrollOffset(selectedRow)
    } else if (selectedRow >= scrollOffset + maxVisibleRows) {
      setScrollOffset(selectedRow - maxVisibleRows + 1)
    }
  }, [selectedRow, scrollOffset, isActive, maxVisibleRows])

  const borderColor = isActive ? "cyan" : "gray"

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={borderColor} paddingX={1}>
      {/* Column header with status label and task count */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={getStatusColor(status)}>
          {STATUS_LABELS[status]} ({tasks.length})
        </Text>
      </Box>

      {/* Task list with scroll indicators */}
      <Box flexDirection="column" flexGrow={1}>
        {tasks.length === 0 ? (
          <Text dimColor>No tasks</Text>
        ) : (
          <>
            {/* Scroll up indicator */}
            {scrollOffset > 0 && (
              <Text dimColor>↑ {scrollOffset} more</Text>
            )}

            {visibleTasks.map((task, i) => {
              const globalIndex = scrollOffset + i
              const isSelected = isActive && selectedRow === globalIndex
              return (
                <Box key={task.id} flexDirection="column" marginBottom={1}>
                  <TaskCard
                    task={task}
                    isSelected={isSelected}
                    isReady={readyIds.has(task.id)}
                    isBlocked={blockedIds.has(task.id)}
                  />
                </Box>
              )
            })}

            {/* Scroll down indicator */}
            {hasMore && (
              <Text dimColor>↓ {tasks.length - (scrollOffset + maxVisibleRows)} more</Text>
            )}
          </>
        )}
      </Box>
    </Box>
  )
}
