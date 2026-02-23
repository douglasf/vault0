import { type RefObject, useRef, useEffect, useMemo } from "react"
import { TextAttributes } from "@opentui/core"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { TaskCard } from "./TaskCard.js"
import type { TaskCard as TaskCardType, Status } from "../lib/types.js"
import { STATUS_LABELS } from "../lib/constants.js"
import { getStatusBgColor, theme } from "../lib/theme.js"

// ─── Constants ───────────────────────────────────────────────────────────────

/** Lines reserved for chrome: app header (~3), column header + margin (2), padding (~1), bottom (~1), buffer (~1). */
const CHROME_OVERHEAD = 8
/** Minimum content height (lines) so the column never collapses to nothing. */
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

// ─── Orphan-header helpers ───────────────────────────────────────────────────

interface OrphanSummary {
  id: string
  title: string
  count: number
}

/**
 * When subtasks are hidden, some subtasks may still appear in a column because
 * their *parent* lives in a different column (an "orphan group"). This function
 * returns one summary entry per such parent.
 */
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

/**
 * Returns the set of task-list indices that should display an orphan-group
 * header above them (the first subtask from each orphan parent group).
 */
function buildOrphanHeaderIndices(tasks: TaskCardType[], parentIdsInColumn: Set<string>): Set<number> {
  const indices = new Set<number>()
  const seenOrphanParents = new Set<string>()

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    if (
      task.parentId !== null &&
      !parentIdsInColumn.has(task.parentId) &&
      !seenOrphanParents.has(task.parentId)
    ) {
      if (task.parentTitle) indices.add(i)
      seenOrphanParents.add(task.parentId)
    }
  }

  return indices
}

// ─── Auto-scroll helper ─────────────────────────────────────────────────────

/**
 * Ensures the selected row is visible in the scrollbox viewport.
 *
 * We use a ref to the `<scrollbox>` renderable and imperatively adjust
 * `scrollTop` rather than declaratively controlling it, because OpenTUI
 * scrollboxes manage their own scroll state. The ref gives us access to:
 *   - `scrollRef.current.content.getChildren()` — laid-out child renderables
 *   - `scrollRef.current.scrollTop` — current scroll offset (read/write)
 *   - `scrollRef.current.viewport.height` — visible area height
 *
 * The algorithm scrolls the minimum amount needed: if the child is above the
 * viewport, align its top edge; if below, align its bottom edge.
 */
function scrollToSelected(scrollRef: RefObject<ScrollBoxRenderable | null>, selectedRow: number, taskCount: number): void {
  if (!scrollRef.current || taskCount === 0) return

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
  hideSubtasks,
}: ColumnProps) {
  // Filter out subtasks when globally hidden
  const tasks = useMemo(
    () => (hideSubtasks ? rawTasks.filter((t) => t.parentId === null) : rawTasks),
    [hideSubtasks, rawTasks],
  )
  const hiddenCount = rawTasks.length - tasks.length

  const { height: terminalRows } = useTerminalDimensions()
  const scrollRef = useRef<ScrollBoxRenderable>(null)

  // ── Orphan summaries (only when subtasks are hidden) ──────────────────
  const orphanParentSummaries = useMemo(
    () => (hideSubtasks ? buildOrphanSummaries(rawTasks) : []),
    [hideSubtasks, rawTasks],
  )

  const parentIdsInColumn = useMemo(
    () => new Set(tasks.filter((t) => t.parentId === null).map((t) => t.id)),
    [tasks],
  )

  const orphanHeaderIndices = useMemo(
    () => (hideSubtasks ? buildOrphanHeaderIndices(tasks, parentIdsInColumn) : new Set<number>()),
    [hideSubtasks, tasks, parentIdsInColumn],
  )

  // ── Layout ────────────────────────────────────────────────────────────
  const availableHeight = Math.max(MIN_CONTENT_HEIGHT, terminalRows - CHROME_OVERHEAD - heightReduction)

  // ── Auto-scroll to keep selected row visible ──────────────────────────
  useEffect(() => {
    if (isActive) scrollToSelected(scrollRef, selectedRow, tasks.length)
  }, [selectedRow, isActive, tasks])

  // ── Width strategy ────────────────────────────────────────────────────
  // Fixed percentage when columnCount is known (multi-column board layout),
  // otherwise flexGrow for single-column usage (NarrowTerminal).
  const fixedWidth: `${number}%` | undefined = columnCount
    ? (`${Math.floor(100 / columnCount)}%` as const)
    : undefined

  const bgColor = getStatusBgColor()

  // ── Header label ──────────────────────────────────────────────────────
  const label = `${STATUS_LABELS[status]} ${tasks.length}${hiddenCount > 0 ? ` (${hiddenCount})` : ""}`

  return (
    <box flexDirection="column" width={fixedWidth} flexGrow={fixedWidth ? 0 : 1} paddingX={1} overflow="hidden" backgroundColor={bgColor}>
      {/* Column header */}
      <box alignItems="center" marginBottom={1}>
        <text
          attributes={isActive ? TextAttributes.BOLD | TextAttributes.UNDERLINE : TextAttributes.BOLD}
          fg={isActive ? theme.blue : theme.fg_1}
        >
          {label}
        </text>
      </box>

      {/* Task list */}
      <box flexDirection="column" flexGrow={1}>
        {tasks.length === 0 ? (
          <text fg={theme.dim_0}>No tasks</text>
        ) : (
          <scrollbox ref={scrollRef} scrollY flexGrow={1} height={availableHeight} viewportCulling>
            {tasks.map((task, i) => (
              <TaskRow
                key={task.id}
                task={task}
                index={i}
                isActive={isActive}
                selectedRow={selectedRow}
                readyIds={readyIds}
                blockedIds={blockedIds}
                orphanHeaderIndices={orphanHeaderIndices}
                tasks={tasks}
              />
            ))}
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

// ─── TaskRow (extracted for clarity) ─────────────────────────────────────────

interface TaskRowProps {
  task: TaskCardType
  index: number
  isActive: boolean
  selectedRow: number
  readyIds: Set<string>
  blockedIds: Set<string>
  orphanHeaderIndices: Set<number>
  tasks: TaskCardType[]
}

/**
 * Renders a single task row inside the column scrollbox, including optional
 * orphan-group headers and parent–subtask margin collapsing.
 */
function TaskRow({ task, index: i, isActive, selectedRow, readyIds, blockedIds, orphanHeaderIndices, tasks }: TaskRowProps) {
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
    <box flexDirection="column" marginBottom={bottomMargin}>
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
}
