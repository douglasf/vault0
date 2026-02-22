import React from "react"
import { Box, Text, useInput } from "ink"
import { theme } from "../lib/theme.js"

export interface ConfirmArchiveDoneProps {
  doneCount: number
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmArchiveDone({ doneCount, onConfirm, onCancel }: ConfirmArchiveDoneProps) {
  useInput((input, key) => {
    if (input === "y" || input === "Y") {
      onConfirm()
    } else if (input === "n" || input === "N" || key.escape) {
      onCancel()
    }
  })

  return (
    <Box flexDirection="column" backgroundColor={theme.bg_1} paddingX={2} paddingY={1}>
      <Text bold color={theme.yellow}>Archive Done Lane</Text>

      <Box marginTop={1} flexDirection="column">
        <Text>
          Archive all {doneCount} task{doneCount !== 1 ? "s" : ""} in the Done column?
        </Text>
        <Box marginTop={1}>
          <Text color={theme.dim_0}>Archived tasks can be viewed using the "Show Archived" filter (f).</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.dim_0}>[y]es  [n]o / Esc: cancel</Text>
      </Box>
    </Box>
  )
}
