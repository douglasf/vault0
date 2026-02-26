import { useRef, useEffect, useMemo, useCallback } from "react"
import { TextAttributes } from "@opentui/core"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { TaskCard } from "./TaskCard.js"
import type { TaskCard as TaskCardType, Status } from "../lib/types.js"
import { STATUS_LABELS } from "../lib/constants.js"
import { getStatusBgColor, theme } from "../lib/theme.js"

// ─── Constants ───────────────────────────────────────────────────────────────

/** Lines reserved for chrome above/below the column content area. */
const CHROME_OVERHEAD = 5
/** Floor so the column never collapses to zero height. */
const MIN_CONTENT_HEIGHT = 3

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ColumnProps {
  status: Status
  tasks: TaskCardType[]
  selectedRow: number
  isActive: boolean
  readyIds: Set<string>
  blockedIds: Set<string>
  /** Extra lines to subtract from available height (e.g. preview panel). */
  heightReduction?: number
  /** Total number of columns displayed — used to compute fixed percentage width. */
  columnCount?: number
  /** Whether subtasks are globally hidden. */
  hideSubtasks?: boolean
  /** Called when a task row is clicked (mouse). */
  onTaskClick?: (taskIndex: number) => void
}

// ─── Visible-task filtering ─────────────────────────────────────────────────

/** Filter tasks based on hideSubtasks flag, returning only top-level tasks. */
function filterVisibleTasks(rawTasks: TaskCardType[], hideSubtasks: boolean): TaskCardType[] {
  if (!hideSubtasks) return rawTasks
  return rawTasks.filter((t) => t.parentId === null)
}

/**
 * Build orphan summaries: when subtasks are hidden, subtasks whose parent
 * lives in a different column still appear. Group them by parent and return
 * a summary for each orphan parent.
 */
interface OrphanSummary {
  id: string
  title: string
  count: number
}

function buildOrphanSummaries(rawTasks: TaskCardType[]): OrphanSummary[] {
  const topLevelIds = new Set<string>()
  for (const t of rawTasks) {
    if (t.parentId === null) topLevelIds.add(t.id)
  }

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
}

// ─── Auto-scroll helper ─────────────────────────────────────────────────────

/**
 * Calculate the absolute Y offset (in character rows) for a given task index,
 * accounting for orphan parent preview rows that add extra height.
 */
function getRowOffset(index: number, orphanParentShownFor: Set<string>, tasks: TaskCardType[]): number {
  let offset = 0
  for (let i = 0; i < index; i++) {
    offset += 1 // base card height
    if (orphanParentShownFor.has(tasks[i].id)) offset += 1 // orphan preview row
  }
  return offset
}

/**
 * Calculate the rendered height of a specific task row.
 */
function getRowHeight(index: number, orphanParentShownFor: Set<string>, tasks: TaskCardType[]): number {
  if (index < 0 || index >= tasks.length) return 1
  return orphanParentShownFor.has(tasks[index].id) ? 2 : 1
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Column({
  status,
  tasks: rawTasks,
  selectedRow,
  isActive,
  readyIds,
  blockedIds,
  heightReduction = 0,
  columnCount,
  hideSubtasks = false,
  onTaskClick,
}: ColumnProps) {
  const { height: terminalRows } = useTerminalDimensions()
  const scrollRef = useRef<ScrollBoxRenderable>(null)

  // ── Derived data ──────────────────────────────────────────────────────

  const tasks = useMemo(
    () => filterVisibleTasks(rawTasks, hideSubtasks),
    [hideSubtasks, rawTasks],
  )

  const hiddenCount = rawTasks.length - tasks.length

  const orphanSummaries = useMemo(
    () => (hideSubtasks ? buildOrphanSummaries(rawTasks) : []),
    [hideSubtasks, rawTasks],
  )

  // ── Layout ────────────────────────────────────────────────────────────

  const availableHeight = Math.max(
    MIN_CONTENT_HEIGHT,
    terminalRows - CHROME_OVERHEAD - heightReduction,
  )

  // Width: fixed percentage for multi-column board
  const fixedWidth: `${number}%` | undefined = columnCount
    ? (`${Math.floor(100 / columnCount)}%` as const)
    : undefined

  const bgColor = getStatusBgColor()

  // ── Orphan parent detection ───────────────────────────────────────────

  const taskIdsInColumn = useMemo(
    () => new Set(tasks.map((t) => t.id)),
    [tasks],
  )

  /**
   * For each orphan subtask group, track which task should show the dimmed
   * parent preview above it (the first subtask of each orphan parent group).
   */
  const orphanParentShownFor = useMemo(() => {
    const shown = new Set<string>()
    const seenParents = new Set<string>()

    for (const t of tasks) {
      if (t.parentId !== null && !taskIdsInColumn.has(t.parentId) && !seenParents.has(t.parentId)) {
        seenParents.add(t.parentId)
        shown.add(t.id)
      }
    }
    return shown
  }, [tasks, taskIdsInColumn])

  // ── Focus management ───────────────────────────────────────────────
  //
  // Two layers prevent unwanted focus changes when clicking inside the
  // column:
  //
  // 1. Scrollbox focusable=false — The scrollbox is focusable by
  //    default in OpenTUI. Setting focusable=false prevents auto-focus
  //    from targeting the scrollbox on click. Without this, the
  //    scrollbox's handleKeyPress intercepts arrow keys for its own
  //    scrollbar navigation, causing double-handling. The focused={false}
  //    prop alone only calls blur() at mount but doesn't prevent
  //    re-focusing on click.
  //
  // 2. preventDefault() on task row onMouseDown — Even with the
  //    scrollbox non-focusable, OpenTUI's dispatchMouseEvent() still
  //    walks ancestors looking for a focusable target. When none is
  //    found, the currently focused element (e.g. the tab-select in
  //    narrow mode) gets blurred. Calling preventDefault() on the
  //    mouse event suppresses the auto-focus ancestor walk entirely,
  //    preserving focus on the tab-select while still firing the
  //    onMouseDown callback for task selection.

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.focusable = false
    }
  }, [])

  // ── Auto-scroll to keep selected row visible ────────────────────────
  //
  // Use scrollTo(absolute) so that after mouse scrolling, arrow keys
  // always snap the viewport back to the cursor position. We calculate
  // the exact Y offset of the selected row and ensure it's within the
  // visible viewport, with a 3-row context buffer above/below when
  // possible. The buffer is clamped so we never over-scroll past the
  // start or end of the list.

  useEffect(() => {
    if (!isActive || tasks.length === 0 || !scrollRef.current) return

    const SCROLL_BUFFER = 3

    const sb = scrollRef.current
    const clampedRow = Math.min(selectedRow, tasks.length - 1)
    const rowTop = getRowOffset(clampedRow, orphanParentShownFor, tasks)
    const rowH = getRowHeight(clampedRow, orphanParentShownFor, tasks)
    const rowBottom = rowTop + rowH
    const viewportH = availableHeight

    // Total content height for clamping
    const totalH = getRowOffset(tasks.length, orphanParentShownFor, tasks)

    const currentScroll = sb.scrollTop

    if (rowTop - SCROLL_BUFFER < currentScroll) {
      // Selected row (with buffer) is above viewport — scroll up
      sb.scrollTo(Math.max(0, rowTop - SCROLL_BUFFER))
    } else if (rowBottom + SCROLL_BUFFER > currentScroll + viewportH) {
      // Selected row (with buffer) is below viewport — scroll down
      sb.scrollTo(Math.min(totalH - viewportH, rowBottom + SCROLL_BUFFER - viewportH))
    }
    // Otherwise, already visible with buffer — don't scroll
  }, [selectedRow, isActive, tasks, orphanParentShownFor, availableHeight])

  // ── Header label ──────────────────────────────────────────────────────

  const label = `${STATUS_LABELS[status]} ${tasks.length}${hiddenCount > 0 ? ` (${hiddenCount})` : ""}`

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <box
      flexDirection="column"
      width={fixedWidth}
      flexGrow={fixedWidth ? 0 : 1}
      paddingX={1}
      overflow="hidden"
      backgroundColor={isActive ? bgColor : theme.bg_2}
    >
      {/* Column header */}
      <box alignItems="center" marginBottom={1}>
        <text
          attributes={TextAttributes.BOLD}
          fg={theme.fg_1}
        >
          {label}
        </text>
      </box>

      {/* Task list */}
      <box flexDirection="column" flexGrow={1}>
        {tasks.length === 0 ? (
          <text fg={theme.dim_0}>No tasks</text>
        ) : (
          <scrollbox ref={scrollRef} scrollY flexGrow={1} height={availableHeight} focused={false}>
            {tasks.map((task, i) => {
              // Determine if this subtask is the last one in its parent group
              const isLastSubtask = task.parentId !== null && (() => {
                const nextTask = tasks[i + 1]
                return !nextTask || nextTask.parentId !== task.parentId
              })()
              const showOrphanParent = orphanParentShownFor.has(task.id)
              return (
                <box key={task.id} flexDirection="column" overflow="hidden" onMouseDown={(e: { preventDefault: () => void }) => { e.preventDefault(); onTaskClick?.(i) }}>
                  {/* Dimmed parent preview for orphaned subtasks */}
                  {showOrphanParent && task.parentTitle && (
                    <box overflow="hidden">
                      <text fg={theme.dim_0} attributes={TextAttributes.ITALIC} truncate={true} wrapMode="none">
                        █ {task.parentTitle}
                      </text>
                    </box>
                  )}
                  <TaskCard
                    task={task}
                    isSelected={isActive && selectedRow === i}
                    isReady={readyIds.has(task.id)}
                    isBlocked={blockedIds.has(task.id)}
                    showParentRef={task.parentId !== null ? false : undefined}
                    isLastSubtask={isLastSubtask}
                  />
                </box>
              )
            })}
          </scrollbox>
        )}

        {/* Orphan parent summaries (visible when subtasks are hidden) */}
        {orphanSummaries.map((summary) => (
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
