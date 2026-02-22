import React, { useState, useEffect } from "react"
import { Box, Text, useStdout } from "ink"
import { TaskCard } from "./TaskCard.js"
import { Scrollbar } from "./Scrollbar.js"
import type { TaskCard as TaskCardType, Status } from "../lib/types.js"
import { STATUS_LABELS } from "../lib/constants.js"
import { solarized, getStatusColor, getStatusBgColor, theme } from "../lib/theme.js"

export interface ColumnProps {
  status: Status
  tasks: TaskCardType[]
  selectedRow: number
  isActive: boolean
  readyIds: Set<string>
  blockedIds: Set<string>
  /** Extra lines to subtract from available height (e.g. preview panel) */
  heightReduction?: number
  /** Total number of columns displayed — used to compute fixed percentage width */
  columnCount?: number
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

export function Column({ status, tasks, selectedRow, isActive, readyIds, blockedIds, heightReduction, columnCount }: ColumnProps) {
  const { stdout } = useStdout()
  const terminalRows = stdout?.rows || 24

  const [scrollOffset, setScrollOffset] = useState(0)

  // Available height in terminal lines for task content.
  // Reserve lines for: App header (~3), column header + marginBottom (2),
  // horizontal padding (~1), bottom breathing room (~1).
  // When a preview panel is visible, subtract its height too.
  const availableHeight = Math.max(3, terminalRows - 8 - (heightReduction || 0))

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

  const bgColor = getStatusBgColor(status)

  // Use fixed percentage width when columnCount is known (multi-column board layout),
  // otherwise fall back to flexGrow for single-column usage (NarrowTerminal).
  const fixedWidth = columnCount ? `${Math.floor(100 / columnCount)}%` : undefined

  return (
    <Box flexDirection="column" width={fixedWidth} flexGrow={fixedWidth ? 0 : 1} paddingX={1} overflow="hidden" backgroundColor={bgColor}>
      {/* Column header with status label and task count */}
      <Box justifyContent="center" marginBottom={1}>
        {isActive ? (
          <Text bold color={solarized.cyan} underline>
            {STATUS_LABELS[status]} ({tasks.length})
          </Text>
        ) : (
          <Text bold color={theme.laneText.primary}>
            {STATUS_LABELS[status]} ({tasks.length})
          </Text>
        )}
      </Box>

      {/* Task list with scrollbar */}
      <Box flexDirection="column">
        {tasks.length === 0 ? (
          <Text color={theme.laneText.muted}>No tasks</Text>
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
                      <Box overflow="hidden">
                        <Text color={theme.laneText.muted} italic wrap="truncate-end">
                          ↳ {task.parentTitle}
                        </Text>
                      </Box>
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
