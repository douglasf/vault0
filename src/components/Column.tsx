import React, { useRef, useEffect } from "react"
import { TextAttributes } from "@opentui/core"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { TaskCard } from "./TaskCard.js"
import type { TaskCard as TaskCardType, Status } from "../lib/types.js"
import { STATUS_LABELS } from "../lib/constants.js"
import { getStatusBgColor, theme } from "../lib/theme.js"

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

export function Column({ status, tasks: rawTasks, selectedRow, isActive, readyIds, blockedIds, heightReduction, columnCount, hideSubtasks }: ColumnProps) {
  // Filter out subtasks when globally hidden
  const tasks = hideSubtasks
    ? rawTasks.filter((t) => t.parentId === null)
    : rawTasks
  const hiddenCount = rawTasks.length - tasks.length
  const { height: terminalRows } = useTerminalDimensions()

  const scrollRef = useRef<ScrollBoxRenderable>(null)

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

  // Precompute which parent IDs exist in this column (for orphan header detection)
  const parentIdsInColumn = React.useMemo(
    () => new Set(tasks.filter((t) => t.parentId === null).map((t) => t.id)),
    [tasks],
  )

  // Track which indices need orphan headers (for rendering)
  const orphanHeaderIndices = React.useMemo(() => {
    const indices = new Set<number>()
    const seenOrphanParents = new Set<string>()
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]
      const needsOrphanHeader =
        task.parentId !== null &&
        !parentIdsInColumn.has(task.parentId) &&
        !seenOrphanParents.has(task.parentId)
      if (needsOrphanHeader && task.parentTitle) {
        indices.add(i)
      }
      if (needsOrphanHeader && task.parentId) {
        seenOrphanParents.add(task.parentId)
      }
    }
    return indices
  }, [tasks, parentIdsInColumn])

  // Available height in terminal lines for task content.
  // Reserve lines for: App header (~3), column header + marginBottom (2),
  // horizontal padding (~1), bottom breathing room (~1).
  // When a preview panel is visible, subtract its height too.
  const availableHeight = Math.max(3, terminalRows - 8 - (heightReduction || 0))

  // Auto-scroll to keep selected row visible when this column is active.
  // Access the ScrollBox's content children to find the selected task's position.
  useEffect(() => {
    if (!isActive || !scrollRef.current || tasks.length === 0) return
    const children = scrollRef.current.content.getChildren()
    if (selectedRow < 0 || selectedRow >= children.length) return

    const child = children[selectedRow]
    const childTop = child.y
    const childBottom = childTop + child.height
    const viewportTop = scrollRef.current.scrollTop
    const viewportBottom = viewportTop + scrollRef.current.viewport.height

    if (childTop < viewportTop) {
      scrollRef.current.scrollTop = childTop
    } else if (childBottom > viewportBottom) {
      scrollRef.current.scrollTop = childBottom - scrollRef.current.viewport.height
    }
  }, [selectedRow, isActive, tasks])

  const bgColor = getStatusBgColor()

  // Use fixed percentage width when columnCount is known (multi-column board layout),
  // otherwise fall back to flexGrow for single-column usage (NarrowTerminal).
  const fixedWidth: `${number}%` | undefined = columnCount ? `${Math.floor(100 / columnCount)}%` : undefined

  return (
    <box flexDirection="column" width={fixedWidth} flexGrow={fixedWidth ? 0 : 1} paddingX={1} overflow="hidden" backgroundColor={bgColor}>
      {/* Column header with status label and task count */}
      <box alignItems="center" marginBottom={1}>
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

      {/* Task list with ScrollBox */}
      <box flexDirection="column" flexGrow={1}>
        {tasks.length === 0 ? (
          <text fg={theme.dim_0}>No tasks</text>
        ) : (
          <scrollbox ref={scrollRef} scrollY flexGrow={1} height={availableHeight} viewportCulling>
            {tasks.map((task, i) => {
              const isSelected = isActive && selectedRow === i
              const isSubtask = task.parentId !== null
              const showOrphanHeader = orphanHeaderIndices.has(i)

              // Reduce vertical spacing within parent–subtask groups:
              // No margin between a parent and its first subtask, or between sibling subtasks.
              const next = tasks[i + 1]
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
          </scrollbox>
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
