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
    <Box flexDirection="column" backgroundColor={theme.ui.panelBgRed} paddingX={2} paddingY={1}>
      <Text bold color={theme.ui.danger}>{isHardDelete ? "Permanently Delete Task" : "Archive Task"}</Text>

      <Box marginTop={1} flexDirection="column">
        {isHardDelete ? (
          <>
            <Text>Do you want to permanently delete this task?</Text>
            <Text color={theme.ui.danger} bold>This action is irreversible.</Text>
          </>
        ) : (
          <Text>Are you sure you want to archive this task?</Text>
        )}
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
