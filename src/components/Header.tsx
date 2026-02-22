import React from "react"
import { Box, Text } from "ink"
import type { Filters } from "../lib/types.js"
import { useDb } from "../lib/db-context.js"
import { getBoard } from "../db/queries.js"

export interface HeaderProps {
  boardId: string
  filters: Filters
  activeFilterCount?: number
  /** Current text search term to display in the header */
  searchTerm?: string
  /** Transient toast message (e.g. "Copied ID!") */
  toast?: string
}

export function Header({ boardId, filters, activeFilterCount = 0, searchTerm, toast }: HeaderProps) {
  const db = useDb()

  // Resolve board name from ID (sync DB lookup — fast)
  let boardName = "Loading..."
  if (boardId) {
    try {
      const board = getBoard(db, boardId)
      boardName = board?.name || boardId
    } catch {
      boardName = boardId
    }
  }

  return (
    <Box flexDirection="column" width="100%" marginBottom={1} borderStyle="round" borderColor="gray">
      <Box justifyContent="center">
        <Text bold>Vault0</Text>
      </Box>
      <Box justifyContent="space-between" paddingX={1}>
        <Text dimColor>{boardName}</Text>
        <Box>
          {toast && (
            <Text color="green" bold> ✓ {toast} </Text>
          )}
          {searchTerm && (
            <Text color="cyan"> 🔍 {searchTerm} </Text>
          )}
          {filters.showArchived && (
            <Text color="yellow" bold> ⌫ archived </Text>
          )}
          {activeFilterCount > 0 && (
            <Text color="cyan" bold> {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active </Text>
          )}
        </Box>
        <Text dimColor>f search | F filter | r ready | b blocked | v preview | ? help | q quit</Text>
      </Box>
    </Box>
  )
}
