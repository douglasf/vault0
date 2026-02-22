import React from "react"
import { Box, Text } from "ink"
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

  return (
    <Box flexDirection="column" paddingLeft={isSubtask ? 1 : 0}>
      {/* Title row with priority dot — subtasks get → prefix */}
      <Box>
        <Text color={isArchived ? theme.dim_0 : priorityColor}>{isSubtask ? "→ " : "● "}</Text>
        <Box flexGrow={1} flexShrink={1} flexBasis={0} overflow="hidden">
          <Text wrap="truncate-end" inverse={isSelected} bold={isSelected} color={isArchived ? theme.dim_0 : theme.fg_1} strikethrough={isArchived}>
            {task.title}
          </Text>
        </Box>
        <Box flexShrink={0}>
          {isArchived && <Text color={theme.dim_0}> ⌫</Text>}
          {isBlocked && <Text color={theme.red}> 🔒</Text>}
          {typeIndicator !== "" && <Text color={typeColor}> {typeIndicator}</Text>}
          {subtaskBadge !== "" && <Text color={theme.fg_0}> {subtaskBadge}</Text>}
        </Box>
      </Box>

      {/* Parent reference for subtasks (only when not grouped by Column) */}
      {showParentRef && isSubtask && task.parentTitle && (
        <Box paddingLeft={2} overflow="hidden">
          <Text color={theme.dim_0} italic wrap="truncate-end">
            ↳ {task.parentTitle}
          </Text>
        </Box>
      )}
    </Box>
  )
}
