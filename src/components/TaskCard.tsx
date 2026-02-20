import React from "react"
import { Box, Text } from "ink"
import type { TaskCard as TaskCardType } from "../lib/types.js"
import { getPriorityColor } from "../lib/theme.js"

export interface TaskCardProps {
  task: TaskCardType
  isSelected: boolean
  isReady: boolean
  isBlocked: boolean
}

export function TaskCard({ task, isSelected, isReady, isBlocked }: TaskCardProps) {
  const priorityColor = getPriorityColor(task.priority)
  const depsBadge = task.dependencyCount > 0 ? `⚑ ${task.dependencyCount} ` : ""
  const subtaskBadge = task.subtaskTotal > 0 ? `◫ ${task.subtaskDone}/${task.subtaskTotal}` : ""
  const statusLine = isBlocked ? "🔒 blocked" : isReady ? "✓ ready" : ""

  return (
    <Box flexDirection="column">
      {/* Title row with priority dot */}
      <Box>
        <Text color={priorityColor}>● </Text>
        <Text inverse={isSelected} bold={isSelected}>
          {task.title.substring(0, 35)}
        </Text>
      </Box>

      {/* Dependency and subtask badges */}
      {(depsBadge || subtaskBadge) && (
        <Box paddingLeft={2}>
          <Text dimColor>
            {depsBadge}
            {subtaskBadge}
          </Text>
        </Box>
      )}

      {/* Ready/blocked indicator */}
      {statusLine && (
        <Box paddingLeft={2}>
          <Text color={isBlocked ? "red" : "green"}>{statusLine}</Text>
        </Box>
      )}
    </Box>
  )
}
