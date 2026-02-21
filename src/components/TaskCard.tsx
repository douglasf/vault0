import React from "react"
import { Box, Text } from "ink"
import type { TaskCard as TaskCardType } from "../lib/types.js"
import { getPriorityColor } from "../lib/theme.js"

export interface TaskCardProps {
  task: TaskCardType
  isSelected: boolean
  isReady: boolean
  isBlocked: boolean
  showParentRef?: boolean
}

export function TaskCard({ task, isSelected, isReady, isBlocked, showParentRef = true }: TaskCardProps) {
  const priorityColor = getPriorityColor(task.priority)
  const depsBadge = task.dependencyCount > 0 ? `⚑ ${task.dependencyCount} ` : ""
  const subtaskBadge = task.subtaskTotal > 0 ? `◫ ${task.subtaskDone}/${task.subtaskTotal}` : ""
  const statusLine = isBlocked ? "🔒 blocked" : ""
  const isSubtask = task.parentId !== null
  const isArchived = task.archivedAt !== null

  return (
    <Box flexDirection="column" paddingLeft={isSubtask ? 1 : 0}>
      {/* Title row with priority dot — subtasks get → prefix */}
      <Box>
        <Text color={isArchived ? "gray" : priorityColor}>{isSubtask ? "→ " : "● "}</Text>
        <Text inverse={isSelected} bold={isSelected} dimColor={isArchived} strikethrough={isArchived}>
          {task.title.substring(0, isSubtask ? 32 : 35)}
        </Text>
        {isArchived && <Text dimColor> ⌫</Text>}
        {subtaskBadge !== "" && <Text dimColor> {subtaskBadge}</Text>}
      </Box>

      {/* Parent reference for subtasks (only when not grouped by Column) */}
      {showParentRef && isSubtask && task.parentTitle && (
        <Box paddingLeft={2}>
          <Text dimColor italic>
            ↳ {task.parentTitle.substring(0, 28)}
          </Text>
        </Box>
      )}

      {/* Dependency badge */}
      {depsBadge !== "" && (
        <Box paddingLeft={2}>
          <Text dimColor>
            {depsBadge}
          </Text>
        </Box>
      )}

      {/* Blocked indicator */}
      {statusLine && (
        <Box paddingLeft={2}>
          <Text color="red">{statusLine}</Text>
        </Box>
      )}
    </Box>
  )
}
