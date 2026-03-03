import { TextAttributes } from "@opentui/core"
import type { Filters, SortField } from "../lib/types.js"
import { useDb } from "../lib/db-context.js"
import { theme } from "../lib/theme.js"
import { getBoard } from "../db/queries.js"
import { SORT_FIELD_LABELS } from "../lib/constants.js"

// ── Types ───────────────────────────────────────────────────────────

export interface HeaderProps {
  boardId: string
  filters: Filters
  activeFilterCount?: number
  /** Current text search term to display in the header */
  searchTerm?: string
  /** Current sort field */
  sortField: SortField
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Keyboard shortcut hints shown on the second header line. */
const SHORTCUT_HINTS = "f search | F filter | S sort | v preview | ? help | q quit"

/**
 * Resolve a board ID to its display name via synchronous DB lookup.
 * Falls back to the raw ID on error, or "Loading..." when no ID is set.
 */
function useBoardName(boardId: string): string {
  const db = useDb()

  if (!boardId) return "Loading..."

  try {
    const board = getBoard(db, boardId)
    return board?.name ?? boardId
  } catch {
    return boardId
  }
}

// ── Component ───────────────────────────────────────────────────────

/**
 * Two-line application header rendered at the top of the board view.
 *
 * Line 1: Logo + status indicators (toast, search, filters)
 * Line 2: Sort field + board name + keyboard shortcut hints
 *
 * Uses `flexShrink={0}` so the header always occupies exactly two lines
 * regardless of terminal height.
 */
export function Header({ boardId, filters, activeFilterCount = 0, searchTerm, sortField }: HeaderProps) {
  const boardName = useBoardName(boardId)

  return (
    <box flexDirection="column" width="100%" marginBottom={1} flexShrink={0} backgroundColor={theme.bg_0}>
      {/* Line 1: Logo + status indicators */}
      <box flexDirection="row" justifyContent="space-between" paddingX={1}>
        <text attributes={TextAttributes.BOLD} fg={theme.fg_1}>Vault0</text>
        <box flexDirection="row">
          {searchTerm && (
            <text fg={theme.cyan}> 🔍 {searchTerm} </text>
          )}
          {filters.showArchived && (
            <text fg={theme.yellow} attributes={TextAttributes.BOLD}> ⌫ archived </text>
          )}
          {activeFilterCount > 0 && (
            <text fg={theme.cyan} attributes={TextAttributes.BOLD}>
              {" "}{activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active{" "}
            </text>
          )}
        </box>
      </box>

      {/* Line 2: Sort + board name + shortcuts */}
      <box flexDirection="row" justifyContent="space-between" paddingX={1}>
        <box flexDirection="row">
          <text fg={theme.cyan}>↕ {SORT_FIELD_LABELS[sortField]}</text>
          <text> | </text>
          <text fg={theme.dim_0}>{boardName}</text>
        </box>
        <text fg={theme.dim_0}>{SHORTCUT_HINTS}</text>
      </box>
    </box>
  )
}
