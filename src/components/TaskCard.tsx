import { memo } from "react"
import { TextAttributes } from "@opentui/core"
import type { TaskCard as TaskCardType, TaskType } from "../lib/types.js"
import { getPriorityColor, getTaskTypeColor, theme } from "../lib/theme.js"
import { TASK_TYPE_INDICATORS } from "../lib/constants.js"

export interface TaskCardProps {
  task: TaskCardType
  isSelected: boolean
  isReady: boolean
  isBlocked: boolean
  showParentRef?: boolean
  /** Whether this is the last subtask in its parent group (for tree connector). */
  isLastSubtask?: boolean
}

/**
 * A single task card rendered inside a board column.
 *
 * Renders the task title with a priority-colored prefix, optional type/subtask
 * badges on the right, and an optional parent-reference line for subtasks.
 *
 * Memoised because the board renders many cards and most are unchanged between
 * re-renders (only the selected card typically changes).
 */
export const TaskCard = memo(function TaskCard({
  task,
  isSelected,
  isBlocked,
  showParentRef = true,
  isLastSubtask = false,
}: TaskCardProps) {
  const isSubtask = task.parentId !== null
  const isArchived = task.archivedAt !== null

  // --- Prefix & colors ---
  const prefix = isSubtask ? (isLastSubtask ? "└ " : "├ ") : "█ "
  const prefixColor = isArchived ? theme.dim_0 : getPriorityColor(task.priority)
  const titleColor = isArchived ? theme.dim_0 : theme.fg_1

  // Combined text attributes for the title
  let titleAttrs = TextAttributes.NONE
  if (isSelected) titleAttrs |= TextAttributes.BOLD
  if (isArchived) titleAttrs |= TextAttributes.STRIKETHROUGH

  // Selected card gets a distinct background across the entire row
  const cardBg = isSelected ? theme.bg_2 : undefined

  // --- Right-side badges ---
  const taskType = task.type as TaskType | null
  const typeIndicator = taskType ? TASK_TYPE_INDICATORS[taskType] : ""
  const typeColor = taskType ? getTaskTypeColor(taskType) : undefined
  const subtaskBadge = task.subtaskTotal > 0 ? `◫ ${task.subtaskDone}/${task.subtaskTotal}` : ""

  return (
    <box flexDirection="column" backgroundColor={cardBg} overflow="hidden">
      {/* Title row: priority prefix | title (truncated) | badges */}
      <box flexDirection="row" overflow="hidden">
        <text fg={prefixColor} attributes={isSelected ? TextAttributes.BOLD : TextAttributes.NONE}>{prefix}</text>
        <text truncate={true} wrapMode="none" flexGrow={1} flexShrink={1} flexBasis={0} minWidth={0} attributes={titleAttrs} fg={titleColor}>
          {task.title}
        </text>
        <box flexDirection="row" flexShrink={0}>
          {isArchived && <text fg={theme.dim_0}> ⌫</text>}
          {isBlocked && <text fg={theme.red}> 🔒</text>}
          {typeIndicator !== "" && <text fg={typeColor}> {typeIndicator}</text>}
          {subtaskBadge !== "" && <text fg={theme.fg_0}> {subtaskBadge}</text>}
        </box>
      </box>

      {/* Parent reference for subtasks (only when not grouped by column) */}
      {showParentRef && isSubtask && task.parentTitle && (
        <box paddingLeft={2} overflow="hidden">
          <text fg={theme.dim_0} attributes={TextAttributes.ITALIC} truncate={true} wrapMode="none">
            ↳ {task.parentTitle}
          </text>
        </box>
      )}
    </box>
  )
})
