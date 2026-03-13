import { useCallback, useEffect, useMemo, useRef } from "react"
import { useBoard } from "./useBoard.js"
import { useNavigation } from "./useNavigation.js"
import { useKeybind } from "./useKeybind.js"
import { VISIBLE_STATUSES } from "../lib/constants.js"
import type { Task, Filters, Status, SortField, TaskCard } from "../lib/types.js"
import type { DbError } from "../lib/db-errors.js"

export interface UseBoardLogicProps {
  boardId: string
  filters?: Filters
  focusTaskId?: string
  inputActive?: boolean
  hideSubtasks?: boolean
  sortField?: SortField
  pendingFocusTaskId?: string
  onSelectTask: (task: Task) => void
  onHighlightTask?: (task: Task | undefined) => void
  onHighlightColumn?: (status: Status) => void
  onMoveTask?: (task: Task, targetStatus: Status) => void
  onDbError?: (error: DbError | null) => void
}

export interface UseBoardLogicResult {
  tasksByStatus: Map<Status, TaskCard[]>
  readyIds: Set<string>
  blockedIds: Set<string>
  nav: ReturnType<typeof useNavigation>
  highlightedTask: TaskCard | undefined
  getColumnTasks: (status: Status) => TaskCard[]
  totalTasks: number
  pendingFocusRef: React.RefObject<string | null>
}

/**
 * Shared board logic used by both Board.tsx (multi-column) and NarrowTerminal.tsx (single-column).
 *
 * Handles DB queries, subtask filtering, navigation setup, focus tracking,
 * highlight/column reporting, task movement, and shared keyboard shortcuts.
 */
export function useBoardLogic({
  boardId,
  filters,
  focusTaskId,
  inputActive,
  hideSubtasks,
  sortField,
  pendingFocusTaskId: pendingFocusTaskIdProp,
  onSelectTask,
  onHighlightTask,
  onHighlightColumn,
  onMoveTask,
  onDbError,
}: UseBoardLogicProps): UseBoardLogicResult {
  const { tasksByStatus, readyIds, blockedIds, dbError } = useBoard(boardId, filters, sortField)

  // Report database errors to parent
  useEffect(() => {
    onDbError?.(dbError)
  }, [dbError, onDbError])

  // Helper to filter out subtasks when globally hidden
  const filterCollapsed = useCallback(
    (tasks: TaskCard[]) => (hideSubtasks ? tasks.filter((t) => t.parentId === null) : tasks),
    [hideSubtasks],
  )

  /** Resolve the visible tasks for a given column status (respecting collapsed state). */
  const getColumnTasks = useCallback(
    (status: Status) => filterCollapsed(tasksByStatus.get(status) || []),
    [filterCollapsed, tasksByStatus],
  )

  // Build row counts per column for navigation boundary clamping (respecting collapsed state)
  const rowCounts = useMemo(
    () => VISIBLE_STATUSES.map((status) => getColumnTasks(status).length),
    [getColumnTasks],
  )

  // Count visible tasks (after hideSubtasks filtering) — used to enable/disable nav keybinds
  const totalTasks = useMemo(
    () => rowCounts.reduce((sum, count) => sum + count, 0),
    [rowCounts],
  )

  // Compute initial navigation position from focusTaskId (restores position after detail view)
  const { initialColumn, initialRow } = useMemo(() => {
    if (!focusTaskId) return { initialColumn: 0, initialRow: 0 }
    for (let col = 0; col < VISIBLE_STATUSES.length; col++) {
      const rowIndex = getColumnTasks(VISIBLE_STATUSES[col]).findIndex((t) => t.id === focusTaskId)
      if (rowIndex >= 0) return { initialColumn: col, initialRow: rowIndex }
    }
    return { initialColumn: 0, initialRow: 0 }
  }, [focusTaskId, getColumnTasks])

  const nav = useNavigation({
    columnCount: VISIBLE_STATUSES.length,
    rowCounts,
    initialColumn,
    initialRow,
  })

  // Track a task that was just moved so we can follow it with the cursor after re-render
  const pendingFocusRef = useRef<string | null>(null)

  // Accept external focus requests (e.g. after task creation)
  useEffect(() => {
    if (pendingFocusTaskIdProp) {
      pendingFocusRef.current = pendingFocusTaskIdProp
    }
  }, [pendingFocusTaskIdProp])

  // After data refreshes, resolve the pending focus task to its new position
  useEffect(() => {
    const taskId = pendingFocusRef.current
    if (!taskId) return
    pendingFocusRef.current = null
    for (let col = 0; col < VISIBLE_STATUSES.length; col++) {
      const rowIndex = getColumnTasks(VISIBLE_STATUSES[col]).findIndex((t) => t.id === taskId)
      if (rowIndex >= 0) {
        nav.navigateTo(col, rowIndex)
        return
      }
    }
  }, [getColumnTasks, nav])

  // Compute the currently highlighted task from navigation position
  const currentColumnTasks = getColumnTasks(VISIBLE_STATUSES[nav.selectedColumn])
  const highlightedTask = currentColumnTasks[nav.selectedRow]

  // Report highlighted task to parent when it changes
  useEffect(() => {
    onHighlightTask?.(highlightedTask)
  }, [highlightedTask, onHighlightTask])

  // Report current column (lane) to parent when it changes
  useEffect(() => {
    onHighlightColumn?.(VISIBLE_STATUSES[nav.selectedColumn])
  }, [nav.selectedColumn, onHighlightColumn])

  /**
   * Move the highlighted task one column in the given direction (-1 = left, +1 = right).
   * Sets up a pending focus so the cursor follows the task after re-render.
   */
  const moveTaskInDirection = useCallback(
    (direction: -1 | 1) => {
      const task = currentColumnTasks[nav.selectedRow]
      const targetCol = nav.selectedColumn + direction
      if (task && targetCol >= 0 && targetCol < VISIBLE_STATUSES.length) {
        pendingFocusRef.current = task.id
        onMoveTask?.(task, VISIBLE_STATUSES[targetCol])
      }
    },
    [currentColumnTasks, nav.selectedRow, nav.selectedColumn, onMoveTask],
  )

  // Keyboard handlers for board navigation (registered in shared "board" scope)
  const navActive = totalTasks > 0 && inputActive !== false

  useKeybind("board", "<", useCallback(() => moveTaskInDirection(-1), [moveTaskInDirection]), { description: "Move task left", when: navActive })
  useKeybind("board", ">", useCallback(() => moveTaskInDirection(1), [moveTaskInDirection]), { description: "Move task right", when: navActive })
  useKeybind("board", "ArrowLeft", useCallback(() => nav.navigateLeft(), [nav]), { description: "Navigate left", when: navActive })
  useKeybind("board", "ArrowRight", useCallback(() => nav.navigateRight(), [nav]), { description: "Navigate right", when: navActive })
  useKeybind("board", "Shift+ArrowUp", useCallback(() => nav.navigateUpBy(5), [nav]), { description: "Navigate up 5", when: navActive })
  useKeybind("board", "Shift+ArrowDown", useCallback(() => nav.navigateDownBy(5), [nav]), { description: "Navigate down 5", when: navActive })
  useKeybind("board", "ArrowUp", useCallback(() => nav.navigateUp(), [nav]), { description: "Navigate up", when: navActive })
  useKeybind("board", "ArrowDown", useCallback(() => nav.navigateDown(), [nav]), { description: "Navigate down", when: navActive })

  const handleEnter = useCallback(() => {
    const selected = nav.selectCurrent()
    if (selected) {
      const tasks = getColumnTasks(VISIBLE_STATUSES[selected.column])
      if (tasks[selected.row]) {
        onSelectTask(tasks[selected.row])
      }
    }
  }, [nav, getColumnTasks, onSelectTask])
  useKeybind("board", "Enter", handleEnter, { description: "Open task detail", when: navActive })

  return {
    tasksByStatus,
    readyIds,
    blockedIds,
    nav,
    highlightedTask,
    getColumnTasks,
    totalTasks,
    pendingFocusRef,
  }
}
