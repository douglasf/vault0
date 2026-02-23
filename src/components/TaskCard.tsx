import React from "react"
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
}

export function TaskCard({ task, isSelected, isReady, isBlocked, showParentRef = true }: TaskCardProps) {
  const priorityColor = getPriorityColor(task.priority)
  const subtaskBadge = task.subtaskTotal > 0 ? `◫ ${task.subtaskDone}/${task.subtaskTotal}` : ""
  const isSubtask = task.parentId !== null
  const isArchived = task.archivedAt !== null

  // Subtle type indicator — shown dimmed after the title
  const taskType = task.type as TaskType | null
  const typeIndicator = taskType ? TASK_TYPE_INDICATORS[taskType] : ""
  const typeColor = taskType ? getTaskTypeColor(taskType) : undefined

  // Compute combined text attributes for the title
  let titleAttrs = TextAttributes.NONE
  if (isSelected) titleAttrs |= TextAttributes.INVERSE | TextAttributes.BOLD
  if (isArchived) titleAttrs |= TextAttributes.STRIKETHROUGH

  return (
    <box flexDirection="column" paddingLeft={isSubtask ? 1 : 0}>
      {/* Title row with priority dot — subtasks get → prefix */}
      <box>
        <text fg={isArchived ? theme.dim_0 : priorityColor}>{isSubtask ? "→ " : "● "}</text>
        <box flexGrow={1} flexShrink={1} flexBasis={0} overflow="hidden">
          <text truncate={true} attributes={titleAttrs} fg={isArchived ? theme.dim_0 : theme.fg_1}>
            {task.title}
          </text>
        </box>
        <box flexShrink={0}>
          {isArchived && <text fg={theme.dim_0}> ⌫</text>}
          {isBlocked && <text fg={theme.red}> 🔒</text>}
          {typeIndicator !== "" && <text fg={typeColor}> {typeIndicator}</text>}
          {subtaskBadge !== "" && <text fg={theme.fg_0}> {subtaskBadge}</text>}
        </box>
      </box>

      {/* Parent reference for subtasks (only when not grouped by Column) */}
      {showParentRef && isSubtask && task.parentTitle && (
        <box paddingLeft={2} overflow="hidden">
          <text fg={theme.dim_0} attributes={TextAttributes.ITALIC} truncate={true}>
            ↳ {task.parentTitle}
          </text>
        </box>
      )}
    </box>
  )
}
