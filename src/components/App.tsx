import React from "react"
import { useState, useCallback, useEffect, useRef } from "react"
import { Box, useInput, useApp } from "ink"
import type { Vault0Database } from "../db/connection.js"
import { DbContext } from "../lib/db-context.js"
import { ErrorBoundary } from "./ErrorBoundary.js"
import { Header } from "./Header.js"
import { Board } from "./Board.js"
import { NarrowTerminal } from "./NarrowTerminal.js"
import { TaskForm } from "./TaskForm.js"
import { StatusPicker } from "./StatusPicker.js"
import { TaskDetail } from "./TaskDetail.js"
import { TaskPreview } from "./TaskPreview.js"
import { FilterBar } from "./FilterBar.js"
import { TextFilterBar } from "./TextFilterBar.js"
import { HelpOverlay } from "./HelpOverlay.js"
import { ConfirmDelete } from "./ConfirmDelete.js"
import { ConfirmArchiveDone } from "./ConfirmArchiveDone.js"
import { theme } from "../lib/theme.js"
import { useTaskActions } from "../hooks/useTaskActions.js"
import { useFilters } from "../hooks/useFilters.js"
import { useDbWatcher } from "../hooks/useDbWatcher.js"
import type { Task, Status, SortField } from "../lib/types.js"
import { getBoards, getTaskCards } from "../db/queries.js"
import { copyToClipboard } from "../lib/clipboard.js"
import { SORT_FIELDS, SORT_FIELD_LABELS } from "../lib/constants.js"

export interface AppProps {
  db: Vault0Database
  dbPath: string
}

export type UIMode = "board" | "detail" | "create" | "edit" | "status-picker" | "filter" | "text-filter" | "help" | "confirm-delete" | "confirm-archive-done"

export interface AppState {
  currentBoardId: string
  uiMode: UIMode
  selectedTask?: Task
  /** When set, the create form creates a subtask under this parent */
  createParent?: Task
  /** The UI mode to return to if the user cancels a delete confirmation */
  deleteReturnMode?: UIMode
}

export function App({ db, dbPath }: AppProps) {
  const { exit } = useApp()
  const [state, setState] = useState<AppState>({
    currentBoardId: "",
    uiMode: "board",
  })

  const actions = useTaskActions(db)
  const filterHook = useFilters()

  // Watch the SQLite database for external changes (e.g., CLI operations in
  // another terminal) and force a re-render so inline DB queries pick up fresh data.
  const forceRefresh = useCallback(() => {
    setState((prev) => ({ ...prev }))
  }, [])

  useDbWatcher(dbPath, forceRefresh)

  // Track terminal dimensions for responsive layout (narrow terminal fallback + fullscreen height)
  const [terminalColumns, setTerminalColumns] = useState(process.stdout.columns || 80)
  const [terminalRows, setTerminalRows] = useState(process.stdout.rows || 24)

  useEffect(() => {
    const handleResize = () => {
      setTerminalColumns(process.stdout.columns || 80)
      setTerminalRows(process.stdout.rows || 24)
    }

    process.stdout.on("resize", handleResize)
    return () => {
      process.stdout.off("resize", handleResize)
    }
  }, [])

  // Track the currently highlighted task in board view via a ref
  // (avoids re-render loops — Board updates this after every render)
  const highlightedTaskRef = useRef<Task | undefined>(undefined)

  // State-tracked version of the highlighted task for the preview panel.
  // Only updates when the task ID actually changes, breaking the render loop.
  const [previewTask, setPreviewTask] = useState<Task | undefined>(undefined)
  const [previewVisible, setPreviewVisible] = useState(false)

  // Global toggle: when true, all subtasks are hidden in the board view
  const [hideSubtasks, setHideSubtasks] = useState(false)

  // Sort field for lane ordering (defaults to priority)
  const [sortField, setSortField] = useState<SortField>("priority")

  // Transient toast message (e.g. "Copied ID!") — auto-clears after a timeout
  const [toast, setToast] = useState("")
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((message: string, durationMs = 2000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(message)
    toastTimerRef.current = setTimeout(() => setToast(""), durationMs)
  }, [])

  // Clean up toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const handleHighlightTask = useCallback((task: Task | undefined) => {
    highlightedTaskRef.current = task
    // Only trigger re-render when task ID changes (prevents infinite loop)
    setPreviewTask((prev) => {
      if (prev?.id === task?.id) return prev
      return task
    })
  }, [])

  const handleMoveTask = useCallback((task: Task, targetStatus: Status) => {
    actions.updateStatus(task.id, targetStatus)
    // Force re-render so Board/NarrowTerminal fetches fresh data
    setState((prev) => ({ ...prev }))
  }, [actions])

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

  // App-level input is active only in board mode.
  // Help mode input is handled entirely by HelpOverlay (which owns text filter input).
  // Detail mode has its own useInput inside TaskDetail.
  // Form/picker modes have their own useInput handlers.
  const appInputActive = state.uiMode === "board"

  useInput((input, _key) => {
    if (input === "a") {
      setState((prev) => ({ ...prev, uiMode: "create", createParent: undefined }))
    } else if (input === "A") {
      const task = highlightedTaskRef.current
      if (task && !task.parentId) {
        setState((prev) => ({ ...prev, uiMode: "create", createParent: task }))
      }
    } else if (input === "e") {
      const task = highlightedTaskRef.current
      if (task) {
        setState((prev) => ({ ...prev, selectedTask: task, uiMode: "edit" }))
      }
    } else if (input === "d") {
      const task = highlightedTaskRef.current
      if (task) {
        setState((prev) => ({ ...prev, selectedTask: task, uiMode: "confirm-delete", deleteReturnMode: "board" }))
      }
    } else if (input === "D") {
      // Archive all tasks in the Done lane
      if (state.currentBoardId) {
        const doneCards = getTaskCards(db, state.currentBoardId).filter((c) => c.status === "done")
        if (doneCards.length > 0) {
          setState((prev) => ({ ...prev, uiMode: "confirm-archive-done" }))
        }
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
      setState((prev) => ({ ...prev, uiMode: "text-filter" }))
    } else if (input === "F") {
      setState((prev) => ({ ...prev, uiMode: "filter" }))
    } else if (input === "r") {
      filterHook.toggleReady()
    } else if (input === "b") {
      filterHook.toggleBlocked()
    } else if (input === "c") {
      const task = highlightedTaskRef.current
      if (task) {
        const ok = copyToClipboard(task.id)
        showToast(ok ? `Copied: ${task.id}` : "Copy failed")
      }
    } else if (input === "?") {
      setState((prev) => ({ ...prev, uiMode: "help" }))
    } else if (input === "h") {
      setHideSubtasks((prev) => !prev)
    } else if (input === "S") {
      setSortField((prev) => {
        const idx = SORT_FIELDS.indexOf(prev)
        return SORT_FIELDS[(idx + 1) % SORT_FIELDS.length]
      })
    } else if (input === "v") {
      setPreviewVisible((prev) => !prev)
    } else if (input === "q") {
      exit()
    }
  }, { isActive: appInputActive })

  // ── Preview panel layout computation ──────────────────────────────────
  // Bottom panel: terminal tall enough (>= 28 rows)
  // Side panel: terminal wide enough (>= 120 cols) but too short for bottom
  // Hidden: neither condition met (toggle state preserved for when terminal resizes)
  const MIN_ROWS_BOTTOM = 28
  const MIN_COLS_SIDE = 120

  let previewLayout: "bottom" | "side" | "hidden" = "hidden"
  let previewHeight = 0
  let boardHeightReduction = 0

  if (previewVisible) {
    if (terminalRows >= MIN_ROWS_BOTTOM) {
      previewLayout = "bottom"
      previewHeight = Math.min(12, Math.max(7, Math.floor(terminalRows / 3)))
      boardHeightReduction = previewHeight
    } else if (terminalColumns >= MIN_COLS_SIDE) {
      previewLayout = "side"
    }
  }

  return (
    <ErrorBoundary>
      <DbContext.Provider value={db}>
        <Box flexDirection="column" width="100%" height={terminalRows} backgroundColor={theme.bg_1}>
          <Header boardId={state.currentBoardId} filters={filterHook.filters} activeFilterCount={filterHook.activeFilterCount} searchTerm={filterHook.filters.search} toast={toast} sortField={sortField} />

          {(state.uiMode === "board" || state.uiMode === "text-filter") && (
            <>
              {state.uiMode === "text-filter" && (
                <TextFilterBar
                  initialValue={filterHook.filters.search || ""}
                  onSearch={filterHook.setSearch}
                  onClose={() => setState((prev) => ({ ...prev, uiMode: "board" }))}
                />
              )}
              {previewLayout === "side" ? (
                <Box flexDirection="row" flexGrow={1}>
                  {terminalColumns < 80 ? (
                    <Box flexGrow={1}>
                      <NarrowTerminal
                        boardId={state.currentBoardId}
                        filters={filterHook.filters}
                        focusTaskId={state.selectedTask?.id}
                        onSelectTask={(task) =>
                          setState((prev) => ({ ...prev, selectedTask: task, uiMode: "detail" }))
                        }
                        onHighlightTask={handleHighlightTask}
                         onMoveTask={handleMoveTask}
                         inputActive={state.uiMode === "board"}
hideSubtasks={hideSubtasks}
                         sortField={sortField}
                       />
                    </Box>
                  ) : (
                    <Box flexGrow={1}>
                      <Board
                        boardId={state.currentBoardId}
                        filters={filterHook.filters}
                        focusTaskId={state.selectedTask?.id}
                        onSelectTask={(task) =>
                          setState((prev) => ({ ...prev, selectedTask: task, uiMode: "detail" }))
                        }
                        onHighlightTask={handleHighlightTask}
                        onMoveTask={handleMoveTask}
                        inputActive={state.uiMode === "board"}
                        hideSubtasks={hideSubtasks}
                        sortField={sortField}
                      />
                    </Box>
                  )}
                  <TaskPreview task={previewTask} orientation="side" />
                </Box>
              ) : (
                <>
                  {terminalColumns < 80 ? (
                    <NarrowTerminal
                      boardId={state.currentBoardId}
                      filters={filterHook.filters}
                      focusTaskId={state.selectedTask?.id}
                      onSelectTask={(task) =>
                        setState((prev) => ({ ...prev, selectedTask: task, uiMode: "detail" }))
                      }
                      onHighlightTask={handleHighlightTask}
                      onMoveTask={handleMoveTask}
                      inputActive={state.uiMode === "board"}
                      heightReduction={boardHeightReduction}
                      hideSubtasks={hideSubtasks}
                      sortField={sortField}
                    />
                  ) : (
                    <Board
                      boardId={state.currentBoardId}
                      filters={filterHook.filters}
                      focusTaskId={state.selectedTask?.id}
                      onSelectTask={(task) =>
                        setState((prev) => ({ ...prev, selectedTask: task, uiMode: "detail" }))
                      }
                      onHighlightTask={handleHighlightTask}
                      onMoveTask={handleMoveTask}
                      inputActive={state.uiMode === "board"}
                      heightReduction={boardHeightReduction}
                      hideSubtasks={hideSubtasks}
                      sortField={sortField}
                    />
                  )}
                  {previewLayout === "bottom" && (
                    <TaskPreview task={previewTask} orientation="bottom" maxHeight={previewHeight} />
                  )}
                </>
              )}
            </>
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
            onDelete={(_taskId) => {
              setState((prev) => ({ ...prev, uiMode: "confirm-delete", deleteReturnMode: "detail" }))
            }}
            onCreateSubtask={(parent) => {
              setState((prev) => ({ ...prev, uiMode: "create", createParent: parent }))
            }}
          />
        )}

        {state.uiMode === "create" && (
          <TaskForm
            mode="create"
            parentTitle={state.createParent?.title}
            onSubmit={(data) => {
              actions.createNewTask(state.currentBoardId, data.title, data.description, data.priority, state.createParent?.id, data.status, data.type)
              setState((prev) => ({ ...prev, uiMode: "board", createParent: undefined }))
            }}
            onCancel={() => setState((prev) => ({ ...prev, uiMode: "board", createParent: undefined }))}
          />
        )}

        {state.uiMode === "edit" && state.selectedTask && (
          <TaskForm
            mode="edit"
            task={state.selectedTask}
            onSubmit={(data) => {
              if (state.selectedTask) {
                actions.updateTaskData(state.selectedTask.id, data.title, data.description, data.priority, data.type)
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

        {state.uiMode === "confirm-delete" && state.selectedTask && (
          <ConfirmDelete
            task={state.selectedTask}
            onConfirm={() => {
              if (state.selectedTask) {
                actions.deleteTask(state.selectedTask.id)
                highlightedTaskRef.current = undefined
              }
              setState((prev) => ({ ...prev, selectedTask: undefined, uiMode: "board", deleteReturnMode: undefined }))
            }}
            onCancel={() => {
              const returnMode = state.deleteReturnMode || "board"
              setState((prev) => ({ ...prev, uiMode: returnMode, deleteReturnMode: undefined }))
            }}
          />
        )}

        {state.uiMode === "confirm-archive-done" && (
          <ConfirmArchiveDone
            doneCount={
              state.currentBoardId
                ? getTaskCards(db, state.currentBoardId).filter((c) => c.status === "done").length
                : 0
            }
            onConfirm={() => {
              if (state.currentBoardId) {
                actions.archiveDoneLane(state.currentBoardId)
              }
              setState((prev) => ({ ...prev, uiMode: "board" }))
            }}
            onCancel={() => {
              setState((prev) => ({ ...prev, uiMode: "board" }))
            }}
          />
        )}
      </Box>
    </DbContext.Provider>
  </ErrorBoundary>
  )
}
