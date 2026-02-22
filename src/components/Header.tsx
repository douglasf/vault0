import React from "react"
import { Box, Text } from "ink"
import type { Filters } from "../lib/types.js"
import { useDb } from "../lib/db-context.js"
import { theme } from "../lib/theme.js"
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
    <Box flexDirection="column" width="100%" marginBottom={1} backgroundColor={theme.ui.headerBg}>
      <Box justifyContent="space-between" paddingX={1}>
        <Text bold>Vault0</Text>
        <Box>
          {toast && (
            <Text color={theme.ui.success} bold> ✓ {toast} </Text>
          )}
          {searchTerm && (
            <Text color={theme.ui.accent}> 🔍 {searchTerm} </Text>
          )}
          {filters.showArchived && (
            <Text color={theme.ui.warning} bold> ⌫ archived </Text>
          )}
          {activeFilterCount > 0 && (
            <Text color={theme.ui.accent} bold> {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active </Text>
          )}
        </Box>
      </Box>
      <Box justifyContent="space-between" paddingX={1}>
        <Text dimColor>{boardName}</Text>
        <Text dimColor>f search | F filter | r ready | b blocked | v preview | ? help | q quit</Text>
      </Box>
    </Box>
  )
}
