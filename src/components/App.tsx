import type React from "react"
import { useState, useCallback, useEffect } from "react"
import { Box, useInput } from "ink"
import type { Vault0Database } from "../db/connection.js"
import { DbContext } from "../lib/db-context.js"
import { Header } from "./Header.js"
import { Board } from "./Board.js"
import type { Task, Filters } from "../lib/types.js"
import { getBoards } from "../db/queries.js"

export interface AppProps {
  db: Vault0Database
}

export type UIMode = "board" | "detail" | "create" | "edit" | "status-picker" | "filter" | "help"

export interface AppState {
  currentBoardId: string
  selectedColumn: number // 0-4
  selectedRow: number // index within column
  uiMode: UIMode
  filters: Filters
  selectedTask?: Task
}

export function App({ db }: AppProps) {
  const [state, setState] = useState<AppState>({
    currentBoardId: "", // Will be set on mount
    selectedColumn: 0,
    selectedRow: 0,
    uiMode: "board",
    filters: {},
  })

  // Initialize board on mount — fetch the first board from the database
  const initializeBoard = useCallback(() => {
    const boardList = getBoards(db)
    if (boardList.length > 0) {
      setState((prev) => ({ ...prev, currentBoardId: boardList[0].id }))
    }
  }, [db])

  useEffect(() => {
    initializeBoard()
  }, [initializeBoard])

  // Global keyboard handler
  useInput((input, key) => {
    if (state.uiMode === "board") {
      handleBoardModeInput(input, key, state, setState)
    } else {
      // Handle other modes in future steps
      if (input === "q" || key.escape) {
        setState((prev) => ({ ...prev, uiMode: "board" }))
      }
    }
  })

  return (
    <DbContext.Provider value={db}>
      <Box flexDirection="column" width="100%">
        <Header boardId={state.currentBoardId} filters={state.filters} />

        {state.uiMode === "board" && (
          <Board
            boardId={state.currentBoardId}
            selectedColumn={state.selectedColumn}
            selectedRow={state.selectedRow}
            onSelectTask={(task) =>
              setState((prev) => ({ ...prev, selectedTask: task, uiMode: "detail" }))
            }
            onNavigate={(col, row) =>
              setState((prev) => ({ ...prev, selectedColumn: col, selectedRow: row }))
            }
          />
        )}

        {state.uiMode === "help" && (
          <Box>
            <Box>{/* Help text will go here in Step 11 */}</Box>
          </Box>
        )}
      </Box>
    </DbContext.Provider>
  )
}

function handleBoardModeInput(
  input: string,
  key: { leftArrow: boolean; rightArrow: boolean; upArrow: boolean; downArrow: boolean; return: boolean; escape: boolean },
  state: AppState,
  setState: React.Dispatch<React.SetStateAction<AppState>>,
) {
  if (key.leftArrow) {
    setState((prev) => ({ ...prev, selectedColumn: Math.max(0, prev.selectedColumn - 1) }))
  } else if (key.rightArrow) {
    setState((prev) => ({ ...prev, selectedColumn: Math.min(4, prev.selectedColumn + 1) }))
  } else if (key.upArrow) {
    setState((prev) => ({ ...prev, selectedRow: Math.max(0, prev.selectedRow - 1) }))
  } else if (key.downArrow) {
    setState((prev) => ({ ...prev, selectedRow: prev.selectedRow + 1 }))
  } else if (input === "a") {
    setState((prev) => ({ ...prev, uiMode: "create" }))
  } else if (input === "?") {
    setState((prev) => ({ ...prev, uiMode: "help" }))
  } else if (input === "q") {
    process.exit(0)
  }
}
