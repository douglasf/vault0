import React, { useState, useEffect } from "react"
import { Box, Text, useStdout } from "ink"
import { TaskCard } from "./TaskCard.js"
import { Scrollbar } from "./Scrollbar.js"
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

/** Compute the rendered line height of a single task card (excluding bottom margin). */
function computeTaskLineHeight(
  task: TaskCardType,
  isBlocked: boolean,
  hasOrphanHeader: boolean,
): number {
  let lines = 1 // title line is always present
  if (hasOrphanHeader) lines += 1
  if (task.dependencyCount > 0) lines += 1
  if (isBlocked) lines += 1
  return lines
}

/**
 * Compute the visible window of tasks starting from scrollOffset that fits
 * within the available terminal lines. Accounts for actual rendered height
 * of each task (title + badges + margins) instead of treating tasks as 1 line.
 */
function computeVisibleWindow(
  tasks: TaskCardType[],
  scrollOffset: number,
  availableHeight: number,
  parentIdsInColumn: Set<string>,
  blockedIds: Set<string>,
): { visibleCount: number; orphanHeaderIndices: Set<number>; totalLinesUsed: number } {
  const orphanHeaderIndices = new Set<number>()
  const seenOrphanParents = new Set<string>()
  let linesUsed = 0
  let visibleCount = 0

  for (let i = scrollOffset; i < tasks.length; i++) {
    const task = tasks[i]

    // Check if this task starts a new orphan group
    const needsOrphanHeader =
      task.parentId !== null &&
      !parentIdsInColumn.has(task.parentId) &&
      !seenOrphanParents.has(task.parentId)
    const hasOrphanHeader = needsOrphanHeader && !!task.parentTitle
    if (needsOrphanHeader && task.parentId) {
      seenOrphanParents.add(task.parentId)
    }

    const taskHeight = computeTaskLineHeight(task, blockedIds.has(task.id), hasOrphanHeader)

    // Bottom margin: 1 line unless followed by a sibling/child in the same group
    const next = tasks[i + 1]
    const isFollowedByChild =
      next !== undefined &&
      next.parentId !== null &&
      (next.parentId === task.id || next.parentId === task.parentId)
    const margin = (i < tasks.length - 1 && !isFollowedByChild) ? 1 : 0

    // Stop if this task won't fit (always include at least one task)
    if (linesUsed + taskHeight > availableHeight && visibleCount > 0) break

    if (hasOrphanHeader) orphanHeaderIndices.add(i)
    linesUsed += taskHeight + margin
    visibleCount++
  }

  return { visibleCount, orphanHeaderIndices, totalLinesUsed: Math.max(linesUsed, 1) }
}

export function Column({ status, tasks, selectedRow, isActive, readyIds, blockedIds }: ColumnProps) {
  const { stdout } = useStdout()
  const terminalRows = stdout?.rows || 24

  const [scrollOffset, setScrollOffset] = useState(0)

  // Available height in terminal lines for task content.
  // Reserve lines for: App header with border (~4), column border top/bottom (2),
  // column header + marginBottom (2), horizontal padding (~1), bottom breathing room (~1).
  const availableHeight = Math.max(3, terminalRows - 10)

  // Precompute which parent IDs exist in this column
  const parentIdsInColumn = new Set(
    tasks.filter((t) => t.parentId === null).map((t) => t.id),
  )

  // Compute the visible window based on actual rendered line heights
  const { visibleCount, orphanHeaderIndices, totalLinesUsed } = computeVisibleWindow(
    tasks, scrollOffset, availableHeight, parentIdsInColumn, blockedIds,
  )

  const visibleTasks = tasks.slice(scrollOffset, scrollOffset + visibleCount)
  const needsScrollbar = tasks.length > visibleCount || scrollOffset > 0

  // Auto-scroll to keep selected row visible when this column is active.
  // Since visible window size varies (tasks have different heights), we scroll
  // incrementally — each step triggers a re-render with a fresh visibleCount
  // until the selected row is within the window.
  useEffect(() => {
    if (!isActive) return
    if (selectedRow < scrollOffset) {
      setScrollOffset(selectedRow)
    } else if (selectedRow >= scrollOffset + visibleCount) {
      setScrollOffset((prev) => prev + 1)
    }
  }, [selectedRow, scrollOffset, isActive, visibleCount])

  const borderColor = isActive ? "cyan" : "gray"

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={borderColor} paddingX={1}>
      {/* Column header with status label and task count */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={getStatusColor(status)}>
          {STATUS_LABELS[status]} ({tasks.length})
        </Text>
      </Box>

      {/* Task list with scrollbar */}
      <Box flexDirection="column">
        {tasks.length === 0 ? (
          <Text dimColor>No tasks</Text>
        ) : (
          <Box flexDirection="row">
            <Box flexDirection="column" flexGrow={1}>
              {visibleTasks.map((task, i) => {
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
              })}
            </Box>
            {needsScrollbar && (
              <Scrollbar
                totalItems={tasks.length}
                visibleItems={visibleCount}
                scrollOffset={scrollOffset}
                trackHeight={totalLinesUsed}
                isActive={isActive}
              />
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}
