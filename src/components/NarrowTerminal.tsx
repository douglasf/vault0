import { useCallback, useEffect, useRef } from "react"
import type { KeyEvent, TabSelectRenderable, TabSelectOption } from "@opentui/core"
import { Column } from "./Column.js"
import { useDb } from "../lib/db-context.js"
import { useBoard } from "../hooks/useBoard.js"
import { useNavigation } from "../hooks/useNavigation.js"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"
import { VISIBLE_STATUSES } from "../lib/constants.js"
import { STATUS_LABELS } from "../lib/constants.js"
import { theme } from "../lib/theme.js"
import type { Task, Filters, Status, SortField, TaskCard as TaskCardType } from "../lib/types.js"
import type { DbError } from "../hooks/useBoard.js"

export interface NarrowTerminalProps {
  boardId: string
  filters?: Filters
  /** When set, the view will focus this task on mount (restoring position after detail view) */
  focusTaskId?: string
  /** Whether keyboard input is active (default true) */
  inputActive?: boolean
  /** Extra lines to subtract from column available height (e.g. preview panel) */
  heightReduction?: number
  onSelectTask: (task: Task) => void
  onHighlightTask?: (task: Task | undefined) => void
  onHighlightColumn?: (status: Status) => void
  onMoveTask?: (task: Task, targetStatus: Status) => void
  /** Whether subtasks are globally hidden */
  hideSubtasks?: boolean
  /** Sort field for lane ordering */
  sortField?: SortField
  /** When set, the view will navigate to this task after the next data refresh */
  pendingFocusTaskId?: string
  /** Called when a database error is detected */
  onDbError?: (error: DbError | null) => void
}

/**
 * Degraded single-column view for narrow terminals (< 80 columns).
 * Shows one status column at a time with left/right arrows to switch.
 */
export function NarrowTerminal({ boardId, filters, focusTaskId, inputActive, heightReduction, onSelectTask, onHighlightTask, onHighlightColumn, onMoveTask, hideSubtasks, sortField, pendingFocusTaskId: pendingFocusTaskIdProp, onDbError }: NarrowTerminalProps) {
  const db = useDb()
  const { tasksByStatus, readyIds, blockedIds, dbError, refetch } = useBoard(db, boardId, filters, sortField)

  // Report database errors to parent
  useEffect(() => {
    onDbError?.(dbError)
  }, [dbError, onDbError])

  // Helper to filter out subtasks when globally hidden
  const filterCollapsed = useCallback((tasks: TaskCardType[]) =>
    hideSubtasks
      ? tasks.filter((t) => t.parentId === null)
      : tasks, [hideSubtasks])

  const rowCounts = VISIBLE_STATUSES.map((status) => filterCollapsed(tasksByStatus.get(status) || []).length)

  // Compute initial navigation position from focusTaskId (restores position after detail view)
  let initialColumn = 0
  let initialRow = 0
  if (focusTaskId) {
    for (let col = 0; col < VISIBLE_STATUSES.length; col++) {
      const tasks = filterCollapsed(tasksByStatus.get(VISIBLE_STATUSES[col]) || [])
      const rowIndex = tasks.findIndex((t) => t.id === focusTaskId)
      if (rowIndex >= 0) {
        initialColumn = col
        initialRow = rowIndex
        break
      }
    }
  }

  const nav = useNavigation({
    columnCount: VISIBLE_STATUSES.length,
    rowCounts,
    initialColumn,
    initialRow,
  })

  // Track a task that was just moved so we can follow it with the cursor after re-render
  const pendingFocusTaskId = useRef<string | null>(null)

  // Accept external focus requests (e.g. after task creation)
  useEffect(() => {
    if (pendingFocusTaskIdProp) {
      pendingFocusTaskId.current = pendingFocusTaskIdProp
    }
  }, [pendingFocusTaskIdProp])
  const tabSelectRef = useRef<TabSelectRenderable>(null)

  // Sync useNavigation's selectedColumn → tab-select when changed externally (e.g. pendingFocus)
  useEffect(() => {
    tabSelectRef.current?.setSelectedIndex(nav.selectedColumn)
  }, [nav.selectedColumn])

  // After data refreshes, resolve the pending focus task to its new position
  useEffect(() => {
    const taskId = pendingFocusTaskId.current
    if (!taskId) return
    pendingFocusTaskId.current = null
    for (let col = 0; col < VISIBLE_STATUSES.length; col++) {
      const tasks = filterCollapsed(tasksByStatus.get(VISIBLE_STATUSES[col]) || [])
      const rowIndex = tasks.findIndex((t) => t.id === taskId)
      if (rowIndex >= 0) {
        nav.navigateTo(col, rowIndex)
        return
      }
    }
  }, [tasksByStatus, filterCollapsed, nav])

  // Compute the currently highlighted task from navigation position
  const currentColumnTasks = filterCollapsed(tasksByStatus.get(VISIBLE_STATUSES[nav.selectedColumn]) || [])
  const highlightedTask = currentColumnTasks[nav.selectedRow]

  // Report highlighted task to parent when it changes
  useEffect(() => {
    onHighlightTask?.(highlightedTask)
  }, [highlightedTask, onHighlightTask])

  // Report current column (lane) to parent when it changes
  useEffect(() => {
    onHighlightColumn?.(VISIBLE_STATUSES[nav.selectedColumn])
  }, [nav.selectedColumn, onHighlightColumn])

  // Keyboard handler — same as Board but also handles enter for selection
  useActiveKeyboard((event: KeyEvent) => {
    const input = event.raw || ""
    const moveLeft = input === "<"
    const moveRight = input === ">"

    if (moveLeft) {
      const task = currentColumnTasks[nav.selectedRow]
      if (task && nav.selectedColumn > 0) {
        const targetStatus = VISIBLE_STATUSES[nav.selectedColumn - 1]
        pendingFocusTaskId.current = task.id
        onMoveTask?.(task, targetStatus)
      }
    } else if (moveRight) {
      const task = currentColumnTasks[nav.selectedRow]
      if (task && nav.selectedColumn < VISIBLE_STATUSES.length - 1) {
        const targetStatus = VISIBLE_STATUSES[nav.selectedColumn + 1]
        pendingFocusTaskId.current = task.id
        onMoveTask?.(task, targetStatus)
      }
    } else if (event.name === "up") nav.navigateUp()
    else if (event.name === "down") nav.navigateDown()
    else if (event.name === "return") {
      const selected = nav.selectCurrent()
      if (selected) {
        const tasks = filterCollapsed(tasksByStatus.get(VISIBLE_STATUSES[selected.column]) || [])
        if (tasks[selected.row]) {
          onSelectTask(tasks[selected.row])
        }
      }
    }
  }, inputActive !== false)

  const activeStatus = VISIBLE_STATUSES[nav.selectedColumn]

  const tabOptions: TabSelectOption[] = VISIBLE_STATUSES.map((status) => ({
    name: STATUS_LABELS[status],
    description: "",
    value: status,
  }))

  const handleTabChange = useCallback((index: number) => {
    nav.navigateToColumn(index)
  }, [nav])

  return (
    <box flexDirection="column" width="100%" flexGrow={1}>
      {/* Column tab indicator */}
      <tab-select
        ref={tabSelectRef}
        options={tabOptions}
        focused={inputActive !== false}
        onChange={handleTabChange}
        textColor={theme.dim_0}
        selectedTextColor={theme.fg_1}
        showDescription={false}
        showUnderline={true}
        wrapSelection={false}
        justifyContent="center"
        marginBottom={1}
      />

      {/* Single visible column */}
      <Column
        status={activeStatus}
        tasks={tasksByStatus.get(activeStatus) || []}
        selectedRow={nav.selectedRow}
        isActive={true}
        readyIds={readyIds}
        blockedIds={blockedIds}
        heightReduction={heightReduction}
        hideSubtasks={hideSubtasks}
      />

      <box marginTop={1} justifyContent="center">
        <text fg={theme.dim_0}>
          {"←"}/{"→"}  switch columns {"  "}
          Up/Down navigate {"  "}
          ? help
        </text>
      </box>
    </box>
  )
}
