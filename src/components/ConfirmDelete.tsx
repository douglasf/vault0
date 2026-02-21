import React from "react"
import { Box, Text, useInput } from "ink"
import type { Task } from "../lib/types.js"

export interface ConfirmDeleteProps {
  task: Task
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDelete({ task, onConfirm, onCancel }: ConfirmDeleteProps) {
  useInput((input, key) => {
    if (input === "y" || input === "Y") {
      onConfirm()
    } else if (input === "n" || input === "N" || key.escape) {
      onCancel()
    }
  })

  const truncatedTitle = task.title.length > 50
    ? `${task.title.substring(0, 47)}...`
    : task.title

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={2} paddingY={1}>
      <Text bold color="red">Archive Task</Text>

      <Box marginTop={1} flexDirection="column">
        <Text>Are you sure you want to archive this task?</Text>
        <Box marginTop={1}>
          <Text dimColor>Task: </Text>
          <Text bold>{truncatedTitle}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[y]es  [n]o / Esc: cancel</Text>
      </Box>
    </Box>
  )
}
