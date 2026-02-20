import React from "react"
import { Box, Text } from "ink"
import type { Filters } from "../lib/types.js"

export interface HeaderProps {
  boardId: string
  filters: Filters
}

export function Header({ boardId, filters }: HeaderProps) {
  const filterIndicators = Object.entries(filters)
    .filter(([_, v]) => v)
    .map(([k]) => k)
    .join(", ")

  return (
    <Box flexDirection="column" width="100%" marginBottom={1} borderStyle="round" borderColor="gray">
      <Box justifyContent="center">
        <Text bold>Vault0 — Kanban Board</Text>
      </Box>
      <Box justifyContent="space-between" paddingX={1}>
        <Text dimColor>Board: {boardId || "Loading..."}</Text>
        {filterIndicators ? <Text dimColor>Filters: {filterIndicators}</Text> : null}
        <Text dimColor>Press ? for help | q to quit</Text>
      </Box>
    </Box>
  )
}
