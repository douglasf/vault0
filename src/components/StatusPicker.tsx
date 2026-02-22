import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import type { Status, Task } from "../lib/types.js"
import { STATUS_LABELS, VISIBLE_STATUSES } from "../lib/constants.js"
import { getStatusColor } from "../lib/theme.js"
import { theme } from "../lib/theme.js"

export interface StatusPickerProps {
  task: Task
  onSelectStatus: (status: Status) => void
  onCancel: () => void
}

export function StatusPicker({ task, onSelectStatus, onCancel }: StatusPickerProps) {
  const currentIndex = VISIBLE_STATUSES.indexOf(task.status as Status)
  const [selectedIndex, setSelectedIndex] = useState(currentIndex >= 0 ? currentIndex : 0)

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(VISIBLE_STATUSES.length - 1, i + 1))
    } else if (key.return) {
      onSelectStatus(VISIBLE_STATUSES[selectedIndex])
    } else if (key.escape) {
      onCancel()
    }
  })

  return (
    <Box flexDirection="column" backgroundColor={theme.bg_1} paddingX={2} paddingY={1}>
      <Text bold color={theme.cyan}>Move Task: {task.title.substring(0, 30)}</Text>

      {VISIBLE_STATUSES.map((status, i) => (
        <Box key={status} marginTop={i === 0 ? 1 : 0}>
          <Text
            color={getStatusColor(status)}
            inverse={i === selectedIndex}
            bold={status === task.status}
          >
            {i === selectedIndex ? "▸ " : "  "}
            {STATUS_LABELS[status]}
            {status === task.status ? " (current)" : ""}
          </Text>
        </Box>
      ))}

      <Box marginTop={1}>
        <Text color={theme.dim_0}>↑/↓: navigate  Enter: select  Esc: cancel</Text>
      </Box>
    </Box>
  )
}
