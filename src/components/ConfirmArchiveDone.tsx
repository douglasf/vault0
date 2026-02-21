import React from "react"
import { Box, Text, useInput } from "ink"

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
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1}>
      <Text bold color="yellow">Archive Done Lane</Text>

      <Box marginTop={1} flexDirection="column">
        <Text>
          Archive all {doneCount} task{doneCount !== 1 ? "s" : ""} in the Done column?
        </Text>
        <Box marginTop={1}>
          <Text dimColor>Archived tasks can be viewed using the "Show Archived" filter (f).</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[y]es  [n]o / Esc: cancel</Text>
      </Box>
    </Box>
  )
}
