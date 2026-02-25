import { Column } from "./Column.js"
import { EmptyBoard } from "./EmptyBoard.js"
import { useBoardLogic } from "../hooks/useBoardLogic.js"
import { VISIBLE_STATUSES } from "../lib/constants.js"
import type { Task, Filters, Status, SortField } from "../lib/types.js"
import type { DbError } from "../lib/db-errors.js"

export interface BoardProps {
  boardId: string
  filters?: Filters
  /** When set, the board will focus this task on mount (restoring position after detail view) */
  focusTaskId?: string
  /** Whether the board's keyboard input is active (default true) */
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
  /** When set, the board will navigate to this task after the next data refresh */
  pendingFocusTaskId?: string
  /** Called when a database error is detected */
  onDbError?: (error: DbError | null) => void
}

/**
 * Main kanban board view.
 *
 * Renders {@link VISIBLE_STATUSES} as columns, manages keyboard-driven
 * navigation and task movement between columns via `<` / `>` keys, and
 * supports cursor restoration when returning from the detail view.
 */
export function Board({
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
}: BoardProps) {
  const { tasksByStatus, readyIds, blockedIds, nav, totalTasks } = useBoardLogic({
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

  if (totalTasks === 0) {
    return <EmptyBoard />
  }

  return (
    <box flexDirection="row" flexGrow={1} width="100%" columnGap={1}>
      {VISIBLE_STATUSES.map((status, colIndex) => (
        <Column
          key={status}
          status={status}
          tasks={tasksByStatus.get(status) || []}
          selectedRow={nav.selectedRow}
          isActive={colIndex === nav.selectedColumn}
          readyIds={readyIds}
          blockedIds={blockedIds}
          heightReduction={heightReduction}
          columnCount={VISIBLE_STATUSES.length}
          hideSubtasks={hideSubtasks}
          onTaskClick={(rowIndex) => nav.navigateTo(colIndex, rowIndex)}
        />
      ))}
    </box>
  )
}
