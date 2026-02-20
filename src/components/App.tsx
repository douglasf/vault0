import React from "react"
import { useState, useCallback, useEffect, useRef } from "react"
import { Box, useInput } from "ink"
import type { Vault0Database } from "../db/connection.js"
import { DbContext } from "../lib/db-context.js"
import { ErrorBoundary } from "./ErrorBoundary.js"
import { Header } from "./Header.js"
import { Board } from "./Board.js"
import { NarrowTerminal } from "./NarrowTerminal.js"
import { TaskForm } from "./TaskForm.js"
import { StatusPicker } from "./StatusPicker.js"
import { TaskDetail } from "./TaskDetail.js"
import { FilterBar } from "./FilterBar.js"
import { HelpOverlay } from "./HelpOverlay.js"
import { useTaskActions } from "../hooks/useTaskActions.js"
import { useFilters } from "../hooks/useFilters.js"
import type { Task } from "../lib/types.js"
import { getBoards } from "../db/queries.js"

export interface AppProps {
  db: Vault0Database
}

export type UIMode = "board" | "detail" | "create" | "edit" | "status-picker" | "filter" | "help"

export interface AppState {
  currentBoardId: string
  uiMode: UIMode
  selectedTask?: Task
}

export function App({ db }: AppProps) {
  const [state, setState] = useState<AppState>({
    currentBoardId: "",
    uiMode: "board",
  })

  const actions = useTaskActions(db)
  const filterHook = useFilters()

  // Track terminal dimensions for responsive layout (narrow terminal fallback)
  const [terminalColumns, setTerminalColumns] = useState(process.stdout.columns || 80)

  useEffect(() => {
    const handleResize = () => {
      setTerminalColumns(process.stdout.columns || 80)
    }

    process.stdout.on("resize", handleResize)
    return () => {
      process.stdout.off("resize", handleResize)
    }
  }, [])

  // Track the currently highlighted task in board view via a ref
  // (avoids re-render loops — Board updates this after every render)
  const highlightedTaskRef = useRef<Task | undefined>(undefined)

  const handleHighlightTask = useCallback((task: Task | undefined) => {
    highlightedTaskRef.current = task
  }, [])

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

  // App-level input is active only in board mode
  // Detail mode has its own useInput inside TaskDetail
  // Form/picker modes have their own useInput handlers
  const appInputActive = state.uiMode === "board" || state.uiMode === "help"

  useInput((input, key) => {
    if (state.uiMode === "board") {
      if (input === "a") {
        setState((prev) => ({ ...prev, uiMode: "create" }))
      } else if (input === "e") {
        const task = highlightedTaskRef.current
        if (task) {
          setState((prev) => ({ ...prev, selectedTask: task, uiMode: "edit" }))
        }
      } else if (input === "d") {
        const task = highlightedTaskRef.current
        if (task) {
          actions.deleteTask(task.id)
          highlightedTaskRef.current = undefined
          setState((prev) => ({ ...prev, selectedTask: undefined }))
        }
      } else if (input === "s") {
        const task = highlightedTaskRef.current
        if (task) {
          setState((prev) => ({ ...prev, selectedTask: task, uiMode: "status-picker" }))
        }
      } else if (input === "p") {
        const task = highlightedTaskRef.current
        if (task) {
          actions.cyclePriority(task.id)
          // Force re-render so Board fetches fresh data
          setState((prev) => ({ ...prev }))
        }
      } else if (input === "f") {
        setState((prev) => ({ ...prev, uiMode: "filter" }))
      } else if (input === "r") {
        filterHook.toggleReady()
      } else if (input === "b") {
        filterHook.toggleBlocked()
      } else if (input === "?") {
        setState((prev) => ({ ...prev, uiMode: "help" }))
      } else if (input === "q") {
        process.exit(0)
      }
    } else if (state.uiMode === "help") {
      if (key.escape || input === "q" || input === "?") {
        setState((prev) => ({ ...prev, uiMode: "board" }))
      }
    }
  }, { isActive: appInputActive })

  return (
    <ErrorBoundary>
      <DbContext.Provider value={db}>
        <Box flexDirection="column" width="100%">
          <Header boardId={state.currentBoardId} filters={filterHook.filters} activeFilterCount={filterHook.activeFilterCount} />

          {state.uiMode === "board" && (
            terminalColumns < 80 ? (
              <NarrowTerminal
                boardId={state.currentBoardId}
                filters={filterHook.filters}
                onSelectTask={(task) =>
                  setState((prev) => ({ ...prev, selectedTask: task, uiMode: "detail" }))
                }
                onHighlightTask={handleHighlightTask}
              />
            ) : (
              <Board
                boardId={state.currentBoardId}
                filters={filterHook.filters}
                onSelectTask={(task) =>
                  setState((prev) => ({ ...prev, selectedTask: task, uiMode: "detail" }))
                }
                onHighlightTask={handleHighlightTask}
              />
            )
          )}

        {state.uiMode === "filter" && (
          <FilterBar
            filters={filterHook.filters}
            onToggleStatus={filterHook.toggleStatus}
            onTogglePriority={filterHook.togglePriority}
            onToggleSource={filterHook.toggleSource}
            onToggleReady={filterHook.toggleReady}
            onToggleBlocked={filterHook.toggleBlocked}
            onToggleArchived={filterHook.toggleArchived}
            onClear={filterHook.clearFilters}
            onClose={() => setState((prev) => ({ ...prev, uiMode: "board" }))}
          />
        )}

        {state.uiMode === "detail" && state.selectedTask && (
          <TaskDetail
            taskId={state.selectedTask.id}
            onBack={() =>
              setState((prev) => ({ ...prev, uiMode: "board" }))
            }
            onEdit={(task) =>
              setState((prev) => ({ ...prev, selectedTask: task, uiMode: "edit" }))
            }
            onStatusPick={(task) =>
              setState((prev) => ({ ...prev, selectedTask: task, uiMode: "status-picker" }))
            }
            onCyclePriority={(taskId) => {
              actions.cyclePriority(taskId)
              // Force re-render so TaskDetail re-fetches
              setState((prev) => ({ ...prev }))
            }}
            onDelete={(taskId) => {
              actions.deleteTask(taskId)
              setState((prev) => ({ ...prev, selectedTask: undefined, uiMode: "board" }))
            }}
          />
        )}

        {state.uiMode === "create" && (
          <TaskForm
            mode="create"
            onSubmit={(data) => {
              actions.createNewTask(state.currentBoardId, data.title, data.description, data.priority)
              setState((prev) => ({ ...prev, uiMode: "board" }))
            }}
            onCancel={() => setState((prev) => ({ ...prev, uiMode: "board" }))}
          />
        )}

        {state.uiMode === "edit" && state.selectedTask && (
          <TaskForm
            mode="edit"
            task={state.selectedTask}
            onSubmit={(data) => {
              if (state.selectedTask) {
                actions.updateTaskData(state.selectedTask.id, data.title, data.description, data.priority)
              }
              setState((prev) => ({ ...prev, uiMode: "board" }))
            }}
            onCancel={() => setState((prev) => ({ ...prev, uiMode: "board" }))}
          />
        )}

        {state.uiMode === "status-picker" && state.selectedTask && (
          <StatusPicker
            task={state.selectedTask}
            onSelectStatus={(status) => {
              if (state.selectedTask) {
                actions.updateStatus(state.selectedTask.id, status)
              }
              setState((prev) => ({ ...prev, uiMode: "board" }))
            }}
            onCancel={() => setState((prev) => ({ ...prev, uiMode: "board" }))}
          />
        )}

        {state.uiMode === "help" && (
          <HelpOverlay
            onClose={() => setState((prev) => ({ ...prev, uiMode: "board" }))}
          />
        )}
      </Box>
    </DbContext.Provider>
  </ErrorBoundary>
  )
}
