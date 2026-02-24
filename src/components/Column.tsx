import { useRef, useEffect, useMemo } from "react"
import { TextAttributes } from "@opentui/core"
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

// ─── Scroll offset computation (viewport windowing) ─────────────────────────
//
// Every task = exactly 1 row. No margins, no variable heights.
// This makes windowing trivial: tasks.slice(scrollOffset, scrollOffset + maxVisible)
//

/**
 * Compute the scroll offset in task units.
 *
 * @param selectedIndex   - The index of the selected task
 * @param totalTasks      - Total number of tasks
 * @param maxVisible      - How many tasks fit in the viewport
 * @param previousOffset  - Previous scroll offset
 * @param block           - "center" for large jumps, "nearest" for arrow nav
 */
function computeScrollOffset(
  selectedIndex: number,
  totalTasks: number,
  maxVisible: number,
  previousOffset: number,
  block: "center" | "nearest",
): number {
  if (totalTasks === 0 || maxVisible <= 0) return 0

  const maxOffset = Math.max(0, totalTasks - maxVisible)

  if (block === "center") {
    const target = selectedIndex - Math.floor(maxVisible / 2)
    return Math.max(0, Math.min(target, maxOffset))
  }

  // "nearest" — keep selected task ~3 rows from top/bottom edges
  const margin = 3
  let offset = previousOffset

  // If selected is too close to the top of the viewport, scroll up
  if (selectedIndex < offset + margin) {
    // Pin to 3 rows from top, but allow first few tasks to reach the actual top
    offset = Math.max(0, selectedIndex - margin)
  }
  // If selected is too close to the bottom of the viewport, scroll down
  else if (selectedIndex >= offset + maxVisible - margin) {
    // Pin to 3 rows from bottom, but allow last few tasks to reach the actual bottom
    offset = selectedIndex - maxVisible + margin + 1
  }
  return Math.max(0, Math.min(offset, maxOffset))
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
}: ColumnProps) {
  const { height: terminalRows } = useTerminalDimensions()

  // Track previous state for scroll behavior decisions
  const wasActiveRef = useRef(false)
  const prevSelectedRowRef = useRef(selectedRow)
  const scrollOffsetRef = useRef(0)

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

  // ── Viewport windowing (replaces scrollbox) ───────────────────────────
  //
  // Compute which tasks are visible based on selectedRow and viewport size.
  // This is the opencode List scrollIntoView pattern adapted for terminal:
  //   - "center" when column first gains focus or large jump
  //   - "nearest" for normal arrow-key navigation

  // Compute scroll offset based on navigation context
  const justBecameActive = isActive && !wasActiveRef.current
  const jumped = Math.abs(selectedRow - prevSelectedRowRef.current) > 1
  const block: "center" | "nearest" = justBecameActive || jumped ? "center" : "nearest"

  // Reserve 1 row each for top/bottom indicators when there's overflow.
  // We do two passes: first with max indicator reservation (2 rows) to get
  // a scroll offset, then adjust based on which indicators are actually shown.
  const totalTasks = tasks.length
  const rawMaxVisible = availableHeight
  const needsScroll = totalTasks > rawMaxVisible

  let maxVisible: number
  let scrollOffset: number
  let startIndex: number
  let endIndex: number
  let showScrollUp: boolean
  let showScrollDown: boolean

  if (!needsScroll) {
    maxVisible = rawMaxVisible
    scrollOffset = 0
    startIndex = 0
    endIndex = totalTasks
    showScrollUp = false
    showScrollDown = false
  } else if (!isActive) {
    // Inactive columns keep their last scroll offset — don't let the active
    // column's selectedRow drive scrolling here.
    // Estimate indicator rows using a conservative content size (reserve 2 for indicators).
    const estimatedContentRows = Math.max(1, rawMaxVisible - 2)
    const hasMoreAbove = scrollOffsetRef.current > 0
    const hasMoreBelow = scrollOffsetRef.current + estimatedContentRows < totalTasks
    const indicatorRows = (hasMoreAbove ? 1 : 0) + (hasMoreBelow ? 1 : 0)
    maxVisible = Math.max(1, rawMaxVisible - indicatorRows)
    scrollOffset = Math.max(0, Math.min(scrollOffsetRef.current, Math.max(0, totalTasks - maxVisible)))
    startIndex = scrollOffset
    endIndex = Math.min(scrollOffset + maxVisible, totalTasks)
    showScrollUp = startIndex > 0
    showScrollDown = endIndex < totalTasks
  } else {
    // First pass: assume 2 indicator rows to get approximate scroll position
    const approxMax = Math.max(1, rawMaxVisible - 2)
    const approxOffset = computeScrollOffset(
      selectedRow, totalTasks, approxMax, scrollOffsetRef.current, block,
    )

    // Determine which indicators are actually needed
    const willShowUp = approxOffset > 0
    const willShowDown = approxOffset + approxMax < totalTasks

    const indicatorRows = (willShowUp ? 1 : 0) + (willShowDown ? 1 : 0)
    maxVisible = Math.max(1, rawMaxVisible - indicatorRows)

    // Second pass: recompute with correct maxVisible
    scrollOffset = computeScrollOffset(
      selectedRow, totalTasks, maxVisible, scrollOffsetRef.current, block,
    )
    startIndex = scrollOffset
    endIndex = Math.min(scrollOffset + maxVisible, totalTasks)
    showScrollUp = startIndex > 0
    showScrollDown = endIndex < totalTasks
  }

  // Update refs after computing (for next render)
  useEffect(() => {
    wasActiveRef.current = isActive
    prevSelectedRowRef.current = selectedRow
    scrollOffsetRef.current = scrollOffset
  }, [isActive, selectedRow, scrollOffset])

  const visibleTasks = useMemo(
    () => tasks.slice(startIndex, endIndex),
    [tasks, startIndex, endIndex],
  )

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
      backgroundColor={bgColor}
    >
      {/* Column header */}
      <box alignItems="center" marginBottom={1}>
        <text
          attributes={
            isActive
              ? TextAttributes.BOLD | TextAttributes.UNDERLINE
              : TextAttributes.BOLD
          }
          fg={isActive ? theme.blue : theme.fg_1}
        >
          {label}
        </text>
      </box>

      {/* Task list with fixed scroll indicators */}
      <box flexDirection="column" flexGrow={1} height={availableHeight}>
        {tasks.length === 0 ? (
          <text fg={theme.dim_0}>No tasks</text>
        ) : (
          <>
            {/* Top scroll indicator — OUTSIDE scrollable area, cannot be overlapped */}
            {showScrollUp ? (
              <text fg={theme.dim_0}>{`  \u25B2 ${startIndex} more`}</text>
            ) : null}

            {/* Scrollable task area — overflow hidden so tasks clip here */}
            <box flexDirection="column" flexGrow={1} overflow="hidden">
              {visibleTasks.map((task, i) => {
                const globalIndex = startIndex + i
                return (
                  <box key={task.id} overflow="hidden">
                    <TaskCard
                      task={task}
                      isSelected={isActive && selectedRow === globalIndex}
                      isReady={readyIds.has(task.id)}
                      isBlocked={blockedIds.has(task.id)}
                      showParentRef={task.parentId !== null ? false : undefined}
                    />
                  </box>
                )
              })}
            </box>

            {/* Bottom scroll indicator — OUTSIDE scrollable area, cannot be overlapped */}
            {showScrollDown ? (
              <text fg={theme.dim_0}>{`  \u25BC ${tasks.length - endIndex} more`}</text>
            ) : null}
          </>
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
