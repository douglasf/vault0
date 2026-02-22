import React from "react"
import { Box, Text, useInput } from "ink"
import type { Task } from "../lib/types.js"
import { theme } from "../lib/theme.js"

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

  const isHardDelete = task.archivedAt !== null

  return (
    <Box flexDirection="column" backgroundColor={theme.bg_1} paddingX={2} paddingY={1}>
      <Text bold color={theme.red}>{isHardDelete ? "Permanently Delete Task" : "Archive Task"}</Text>

      <Box marginTop={1} flexDirection="column">
        {isHardDelete ? (
          <>
            <Text color={theme.fg_1}>Do you want to permanently delete this task?</Text>
            <Text color={theme.red} bold>This action is irreversible.</Text>
          </>
        ) : (
          <Text color={theme.fg_1}>Are you sure you want to archive this task?</Text>
        )}
        <Box marginTop={1}>
          <Text color={theme.dim_0}>Task: </Text>
          <Text color={theme.fg_1} bold>{truncatedTitle}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.fg_1}>[y]es  [n]o / Esc: cancel</Text>
      </Box>
    </Box>
  )
}
