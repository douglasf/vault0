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

            {(() => {
              // Precompute which parent IDs exist in this column
              const parentIdsInColumn = new Set(
                tasks.filter((t) => t.parentId === null).map((t) => t.id),
              )

              // Precompute which visible task indices need an orphan group header
              const orphanHeaderIndices = new Set<number>()
              const seenOrphanParents = new Set<string>()
              for (let i = 0; i < visibleTasks.length; i++) {
                const task = visibleTasks[i]
                if (
                  task.parentId &&
                  !parentIdsInColumn.has(task.parentId) &&
                  !seenOrphanParents.has(task.parentId)
                ) {
                  seenOrphanParents.add(task.parentId)
                  orphanHeaderIndices.add(scrollOffset + i)
                }
              }

              return visibleTasks.map((task, i) => {
                const globalIndex = scrollOffset + i
                const isSelected = isActive && selectedRow === globalIndex
                const isSubtask = task.parentId !== null
                const showOrphanHeader = orphanHeaderIndices.has(globalIndex)

                // Reduce vertical spacing within parent–subtask groups:
                // No margin between a parent and its first subtask, or between sibling subtasks.
                const next = visibleTasks[i + 1]
                const isFollowedByChild =
                  next !== undefined &&
                  next.parentId !== null &&
                  (next.parentId === task.id || next.parentId === task.parentId)
                const bottomMargin = isFollowedByChild ? 0 : 1

                return (
                  <Box key={task.id} flexDirection="column" marginBottom={bottomMargin}>
                    {/* Orphan group header — shown once per parent group */}
                    {showOrphanHeader && task.parentTitle && (
                      <Text dimColor italic>
                        ↳ {task.parentTitle.substring(0, 30)}
                      </Text>
                    )}
                    <TaskCard
                      task={task}
                      isSelected={isSelected}
                      isReady={readyIds.has(task.id)}
                      isBlocked={blockedIds.has(task.id)}
                      showParentRef={isSubtask ? false : undefined}
                    />
                  </Box>
                )
              })
            })()}

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
