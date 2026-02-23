import React, { useState, useEffect } from "react"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { TaskCard } from "./TaskCard.js"
import { Scrollbar } from "./Scrollbar.js"
import type { TaskCard as TaskCardType, Status } from "../lib/types.js"
import { STATUS_LABELS } from "../lib/constants.js"
import { getStatusColor, getStatusBgColor, theme } from "../lib/theme.js"

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
  /** Whether subtasks are globally hidden */
  hideSubtasks?: boolean
}

/** Compute the rendered line height of a single task card (excluding bottom margin). */
function computeTaskLineHeight(
  task: TaskCardType,
  isBlocked: boolean,
  hasOrphanHeader: boolean,
): number {
  let lines = 1 // title line is always present (blocked icon is inline)
  if (hasOrphanHeader) lines += 1
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

export function Column({ status, tasks: rawTasks, selectedRow, isActive, readyIds, blockedIds, heightReduction, columnCount, hideSubtasks }: ColumnProps) {
  // Filter out subtasks when globally hidden
  const tasks = hideSubtasks
    ? rawTasks.filter((t) => t.parentId === null)
    : rawTasks
  const hiddenCount = rawTasks.length - tasks.length
  const { height: terminalRows } = useTerminalDimensions()

  // Compute orphan parent summaries when subtasks are hidden:
  // For each parent that has subtasks in this column but is NOT itself in this column,
  // show a header with the count of hidden subtasks.
  const orphanParentSummaries = React.useMemo(() => {
    if (!hideSubtasks) return []
    const topLevelIds = new Set(rawTasks.filter((t) => t.parentId === null).map((t) => t.id))
    const groups = new Map<string, { title: string; count: number }>()
    for (const t of rawTasks) {
      if (t.parentId !== null && !topLevelIds.has(t.parentId) && t.parentTitle) {
        const existing = groups.get(t.parentId)
        if (existing) {
          existing.count++
        } else {
          groups.set(t.parentId, { title: t.parentTitle, count: 1 })
        }
      }
    }
    return Array.from(groups.entries()).map(([id, { title, count }]) => ({ id, title, count }))
  }, [hideSubtasks, rawTasks])

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

  // Clamp scrollOffset when the task list shrinks (e.g. a task was moved out).
  // This must run for ALL columns, not just the active one, to prevent
  // invisible tasks caused by a stale scrollOffset.
  // Key insight: if all remaining tasks fit on screen from offset 0, reset to 0.
  // Otherwise, ensure scrollOffset doesn't push us past the end.
  useEffect(() => {
    if (tasks.length === 0) {
      setScrollOffset(0)
    } else if (scrollOffset > 0) {
      // Check if all tasks would fit starting from offset 0
      const { visibleCount: countFromZero } = computeVisibleWindow(
        tasks, 0, availableHeight, parentIdsInColumn, blockedIds,
      )
      if (countFromZero >= tasks.length) {
        // All tasks fit — no need to scroll at all
        setScrollOffset(0)
      } else if (scrollOffset >= tasks.length) {
        setScrollOffset(Math.max(0, tasks.length - 1))
      }
    }
  }, [tasks, scrollOffset, availableHeight, parentIdsInColumn, blockedIds])

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

  const bgColor = getStatusBgColor()

  // Use fixed percentage width when columnCount is known (multi-column board layout),
  // otherwise fall back to flexGrow for single-column usage (NarrowTerminal).
  const fixedWidth: `${number}%` | undefined = columnCount ? `${Math.floor(100 / columnCount)}%` : undefined

  return (
    <box flexDirection="column" width={fixedWidth} flexGrow={fixedWidth ? 0 : 1} paddingX={1} overflow="hidden" backgroundColor={bgColor}>
      {/* Column header with status label and task count */}
      <box justifyContent="center" marginBottom={1}>
        {isActive ? (
           <text attributes={TextAttributes.BOLD | TextAttributes.UNDERLINE} fg={theme.blue}>
            {STATUS_LABELS[status]} {tasks.length}{hiddenCount > 0 ? ` (${hiddenCount})` : ""}
          </text>
        ) : (
          <text attributes={TextAttributes.BOLD} fg={theme.fg_1}>
            {STATUS_LABELS[status]} {tasks.length}{hiddenCount > 0 ? ` (${hiddenCount})` : ""}
          </text>
        )}
      </box>

      {/* Task list with scrollbar */}
      <box flexDirection="column" flexGrow={1}>
        {tasks.length === 0 ? (
          <text fg={theme.dim_0}>No tasks</text>
        ) : (
          <box flexDirection="row">
            <box flexDirection="column" flexGrow={1}>
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
                  <box key={task.id} flexDirection="column" marginBottom={bottomMargin}>
                    {/* Orphan group header — shown once per parent group */}
                    {showOrphanHeader && task.parentTitle && (
                      <box overflow="hidden">
                        <text fg={theme.dim_0} attributes={TextAttributes.ITALIC} truncate={true}>
                          ↳ {task.parentTitle}
                        </text>
                      </box>
                    )}
                    <TaskCard
                      task={task}
                      isSelected={isSelected}
                      isReady={readyIds.has(task.id)}
                      isBlocked={blockedIds.has(task.id)}
                      showParentRef={isSubtask ? false : undefined}
                    />
                  </box>
                )
              })}
            </box>
            {needsScrollbar && (
              <Scrollbar
                totalItems={tasks.length}
                visibleItems={visibleCount}
                scrollOffset={scrollOffset}
                trackHeight={totalLinesUsed}
                isActive={isActive}
              />
            )}
          </box>
        )}
        {/* Orphan parent summaries when subtasks are hidden */}
        {orphanParentSummaries.map((summary) => (
          <box key={summary.id} marginTop={tasks.length > 0 ? 1 : 0} overflow="hidden">
            <text fg={theme.dim_0} attributes={TextAttributes.ITALIC} truncate={true}>
              {summary.title} ({summary.count})
            </text>
          </box>
        ))}
      </box>
    </box>
  )
}
