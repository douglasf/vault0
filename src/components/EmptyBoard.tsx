import React from "react"
import { Box, Text } from "ink"
import { theme } from "../lib/theme.js"
import { LOGO_LINES } from "../lib/logo.js"

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
        <Box flexDirection="column" marginBottom={1}>
          {LOGO_LINES.map((line) => (
            <Text key={line} color={theme.fg_0}>
              {line}
            </Text>
          ))}
        </Box>
        <Text bold color={theme.yellow}>
          No tasks yet
        </Text>
        <Box marginTop={1}>
          <Text color={theme.dim_0}>Press 'a' to create your first task</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.dim_0}>Press '?' for help</Text>
        </Box>
      </Box>
    </Box>
  )
}
