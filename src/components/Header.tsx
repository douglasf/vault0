import React from "react"
import { TextAttributes } from "@opentui/core"
import type { Filters, SortField } from "../lib/types.js"
import { useDb } from "../lib/db-context.js"
import { theme } from "../lib/theme.js"
import { getBoard } from "../db/queries.js"
import { SORT_FIELD_LABELS } from "../lib/constants.js"

export interface HeaderProps {
  boardId: string
  filters: Filters
  activeFilterCount?: number
  /** Current text search term to display in the header */
  searchTerm?: string
  /** Transient toast message (e.g. "Copied ID!") */
  toast?: string
  /** Current sort field */
  sortField: SortField
}

export function Header({ boardId, filters, activeFilterCount = 0, searchTerm, toast, sortField }: HeaderProps) {
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
    <box flexDirection="column" width="100%" marginBottom={1} flexShrink={0} backgroundColor={theme.bg_0}>
      <box flexDirection="row" justifyContent="space-between" paddingX={1}>
        <text attributes={TextAttributes.BOLD} fg={theme.fg_1}>Vault0</text>
        <box flexDirection="row">
          {toast && (
            <text fg={theme.green} attributes={TextAttributes.BOLD}> ✓ {toast} </text>
          )}
          {searchTerm && (
            <text fg={theme.cyan}> 🔍 {searchTerm} </text>
          )}
          {filters.showArchived && (
            <text fg={theme.yellow} attributes={TextAttributes.BOLD}> ⌫ archived </text>
          )}
          {activeFilterCount > 0 && (
            <text fg={theme.cyan} attributes={TextAttributes.BOLD}> {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active </text>
          )}
        </box>
      </box>
      <box flexDirection="row" justifyContent="space-between" paddingX={1}>
        <box flexDirection="row">
          <text fg={theme.cyan}>↕ {SORT_FIELD_LABELS[sortField]}</text>
          <text> | </text>
          <text fg={theme.dim_0}>{boardName}</text>
        </box>
        <text fg={theme.dim_0}>f search | F filter | S sort | v preview | ? help | q quit</text>
      </box>
    </box>
  )
}
