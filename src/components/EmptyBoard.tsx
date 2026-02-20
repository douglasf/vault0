import React from "react"
import { Box, Text } from "ink"

export function EmptyBoard() {
  return (
    <Box
      flexDirection="column"
      width="100%"
      flexGrow={1}
      justifyContent="center"
      alignItems="center"
    >
      <Box flexDirection="column" alignItems="center">
        <Text bold color="yellow">
          No tasks yet
        </Text>
        <Box marginTop={1}>
          <Text dimColor>Press 'a' to create your first task</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press '?' for help</Text>
        </Box>
      </Box>
    </Box>
  )
}
