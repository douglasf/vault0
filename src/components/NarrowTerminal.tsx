import { useCallback, useEffect, useRef } from "react"
import type { TabSelectRenderable, TabSelectOption } from "@opentui/core"
import { Column } from "./Column.js"
import { useBoardLogic } from "../hooks/useBoardLogic.js"
import { VISIBLE_STATUSES } from "../lib/constants.js"
import { STATUS_LABELS } from "../lib/constants.js"
import { theme } from "../lib/theme.js"
import type { Task, Filters, Status, SortField } from "../lib/types.js"
import type { DbError } from "../lib/db-errors.js"

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
export function NarrowTerminal({
  boardId,
  filters,
  focusTaskId,
  inputActive,
  heightReduction,
  onSelectTask,
  onHighlightTask,
  onHighlightColumn,
  onMoveTask,
  hideSubtasks,
  sortField,
  pendingFocusTaskId,
  onDbError,
}: NarrowTerminalProps) {
  const { tasksByStatus, readyIds, blockedIds, nav } = useBoardLogic({
    boardId,
    filters,
    focusTaskId,
    inputActive,
    hideSubtasks,
    sortField,
    pendingFocusTaskId,
    onSelectTask,
    onHighlightTask,
    onHighlightColumn,
    onMoveTask,
    onDbError,
  })

  const tabSelectRef = useRef<TabSelectRenderable>(null)

  // Sync useNavigation's selectedColumn → tab-select when changed externally (e.g. pendingFocus)
  useEffect(() => {
    tabSelectRef.current?.setSelectedIndex(nav.selectedColumn)
  }, [nav.selectedColumn])

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
        onTaskClick={(rowIndex) => nav.navigateTo(nav.selectedColumn, rowIndex)}
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
