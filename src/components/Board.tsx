import React from "react"
import { Box, Text } from "ink"
import type { Task } from "../lib/types.js"

export interface BoardProps {
  boardId: string
  selectedColumn: number
  selectedRow: number
  onSelectTask: (task: Task) => void
  onNavigate: (column: number, row: number) => void
}

export function Board({ boardId, selectedColumn, selectedRow }: BoardProps) {
  // Placeholder: just show a message
  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
      <Text>Board: {boardId}</Text>
      <Text>Selected: Column {selectedColumn}, Row {selectedRow}</Text>
      <Text dimColor>(Full board implementation in Step 5)</Text>
    </Box>
  )
}
