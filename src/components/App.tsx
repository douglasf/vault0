import { useState, useCallback, useEffect, useRef } from "react"
import { useRenderer, useTerminalDimensions } from "@opentui/react"
import type { KeyEvent } from "@opentui/core"
import type { Vault0Database } from "../db/connection.js"
import { DbContext } from "../lib/db-context.js"
import { ToastContext } from "../lib/toast-context.js"
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
import { CreateRelease } from "./CreateRelease.js"
import { ReleasesView } from "./ReleasesView.js"
import { ErrorBanner } from "./ErrorBanner.js"
import { Toast } from "./Toast.js"
import { theme, toggleAppearance, getAppearance, getActiveThemeName } from "../lib/theme.js"
import { saveGlobalConfig } from "../lib/config.js"
import { ThemePicker } from "./ThemePicker.js"
import { useTaskActions } from "../hooks/useTaskActions.js"
import { useFilters } from "../hooks/useFilters.js"
import { useDbWatcher } from "../hooks/useDbWatcher.js"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"
import { useToastState } from "../hooks/useToast.js"
import type { Task, Status, SortField } from "../lib/types.js"
import type { DbError } from "../lib/db-errors.js"
import { getBoards, getTaskCards, getReleases, getReleaseTopLevelTasks, getReleaseTaskSubtasks, createRelease, restoreTaskFromRelease, restoreAllFromRelease, deleteRelease } from "../db/queries.js"
import { copyToClipboard } from "../lib/clipboard.js"
import { SORT_FIELDS } from "../lib/constants.js"
import { detectVersionFiles, writeVersion } from "../lib/version-detect.js"

export interface AppProps {
  db: Vault0Database
  dbPath: string
  repoRoot: string
}

export type UIMode = "board" | "releases" | "detail" | "create" | "edit" | "status-picker" | "filter" | "text-filter" | "help" | "confirm-delete" | "theme-picker" | "create-release"

/** Modal overlay modes — board stays mounted but input is routed to the overlay */
const MODAL_OVERLAY_MODES: ReadonlySet<UIMode> = new Set(["help", "confirm-delete", "status-picker", "filter", "theme-picker", "create", "edit", "create-release"])

// Layout thresholds
const MIN_COLS_NARROW = 80
const MIN_ROWS_BOTTOM_PREVIEW = 28
const MIN_COLS_SIDE_PREVIEW = 120

export interface AppState {
  currentBoardId: string
  uiMode: UIMode
  selectedTask?: Task
  /** When set, the create form creates a subtask under this parent */
  createParent?: Task
  /** The UI mode to return to if the user cancels a delete confirmation */
  deleteReturnMode?: UIMode
  /** When set, the board will focus this task after the next render */
  pendingFocusTaskId?: string
}

export function App({ db, dbPath, repoRoot }: AppProps) {
  const renderer = useRenderer()
  const { width: terminalColumns, height: terminalRows } = useTerminalDimensions()
  const [state, setState] = useState<AppState>({
    currentBoardId: "",
    uiMode: "board",
  })

  const actions = useTaskActions(db)
  const filterHook = useFilters()

  // Clear pendingFocusTaskId after it's been passed to the board components
  useEffect(() => {
    if (state.pendingFocusTaskId) {
      setState((prev) => ({ ...prev, pendingFocusTaskId: undefined }))
    }
  }, [state.pendingFocusTaskId])

  // Watch the SQLite database for external changes (e.g., CLI operations in
  // another terminal) and force a re-render so inline DB queries pick up fresh data.
  const forceRefresh = useCallback(() => {
    setState((prev) => ({ ...prev }))
  }, [])

  useDbWatcher(dbPath, forceRefresh)

  // Track the currently highlighted task in board view via a ref
  // (avoids re-render loops — Board updates this after every render)
  const highlightedTaskRef = useRef<Task | undefined>(undefined)

  // Track the currently selected lane (status column) so new tasks default to it
  const currentLaneRef = useRef<Status>("backlog")

  // State-tracked version of the highlighted task for the preview panel.
  // Only updates when the task ID actually changes, breaking the render loop.
  const [previewTask, setPreviewTask] = useState<Task | undefined>(undefined)
  const [previewVisible, setPreviewVisible] = useState(false)

  // Global toggle: when true, all subtasks are hidden in the board view
  const [hideSubtasks, setHideSubtasks] = useState(false)

  // Sort field for lane ordering (defaults to priority)
  const [sortField, setSortField] = useState<SortField>("priority")

  // Toast notification system — context-based so any component can trigger toasts
  const toastState = useToastState()
  const { showToast } = toastState

  // Database error state — surfaced from Board/NarrowTerminal via onDbError callback
  const [dbError, setDbError] = useState<DbError | null>(null)

  const handleDbError = useCallback((error: DbError | null) => {
    setDbError(error)
  }, [])

  // Clean up handled by useToastState hook

  const handleHighlightTask = useCallback((task: Task | undefined) => {
    highlightedTaskRef.current = task
    // Only trigger re-render when task ID changes (prevents infinite loop)
    setPreviewTask((prev) => {
      if (prev?.id === task?.id) return prev
      return task
    })
  }, [])

  const handleHighlightColumn = useCallback((status: Status) => {
    currentLaneRef.current = status
  }, [])

  const handleMoveTask = useCallback((task: Task, targetStatus: Status) => {
    actions.updateStatus(task.id, targetStatus)
    // Force re-render so Board/NarrowTerminal fetches fresh data
    forceRefresh()
  }, [actions, forceRefresh])

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

  const isModalOverlay = MODAL_OVERLAY_MODES.has(state.uiMode)

  // Board-like modes where the board/narrow terminal is visible
  const isBoardVisible = (state.uiMode === "board" || state.uiMode === "text-filter" || state.uiMode === "filter" || isModalOverlay) && state.uiMode !== "releases"

  // App-level input is active only in board mode (not during overlays).
  const appInputActive = state.uiMode === "board"

  // Board input is active only in pure board mode (not during overlays or text-filter)
  const boardInputActive = state.uiMode === "board"

  useActiveKeyboard((event: KeyEvent) => {
    const input = event.raw || ""
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
    } else if (input === "u") {
      const task = highlightedTaskRef.current
      if (task && task.archivedAt !== null) {
        actions.undeleteTask(task.id)
        forceRefresh()
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
        forceRefresh()
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
        showToast(ok ? "Copied" : "Copy failed", ok ? task.id : "Could not copy to clipboard")
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
    } else if (input === "t") {
      setState((prev) => ({ ...prev, uiMode: "theme-picker" }))
    } else if (input === "R") {
      setState((prev) => ({ ...prev, uiMode: "create-release" }))
    } else if (input === "W") {
      setState((prev) => ({ ...prev, uiMode: "releases" }))
    } else if (input === "q") {
      renderer.destroy()
    }
  }, appInputActive)

  // Escape dismisses toasts when in board mode (doesn't interfere with modal overlays)
  useActiveKeyboard((event: KeyEvent) => {
    if (event.name === "escape" && toastState.toasts.length > 0) {
      toastState.dismissAll()
    }
  }, appInputActive)

  // ── Shared board/narrow-terminal props and renderer ────────────────────
  const isNarrow = terminalColumns < MIN_COLS_NARROW

  const onSelectTask = useCallback((task: Task) => {
    setState((prev) => ({ ...prev, selectedTask: task, uiMode: "detail" }))
  }, [])

  const renderBoardView = (heightReduction = 0) => {
    const sharedProps = {
      boardId: state.currentBoardId,
      filters: filterHook.filters,
      focusTaskId: state.selectedTask?.id,
      pendingFocusTaskId: state.pendingFocusTaskId,
      onSelectTask,
      onHighlightTask: handleHighlightTask,
      onHighlightColumn: handleHighlightColumn,
      onMoveTask: handleMoveTask,
      inputActive: boardInputActive,
      hideSubtasks,
      sortField,
      onDbError: handleDbError,
    } as const

    if (isNarrow) {
      return <NarrowTerminal {...sharedProps} heightReduction={heightReduction} />
    }
    return <Board {...sharedProps} heightReduction={heightReduction} />
  }

  // ── Preview panel layout computation ──────────────────────────────────
  // Bottom panel: terminal tall enough (>= MIN_ROWS_BOTTOM_PREVIEW rows)
  // Side panel: terminal wide enough (>= MIN_COLS_SIDE_PREVIEW cols) but too short for bottom
  // Hidden: neither condition met (toggle state preserved for when terminal resizes)
  let previewLayout: "bottom" | "side" | "hidden" = "hidden"
  let previewHeight = 0
  let boardHeightReduction = 0

  if (previewVisible) {
    if (terminalRows >= MIN_ROWS_BOTTOM_PREVIEW) {
      previewLayout = "bottom"
      previewHeight = Math.min(12, Math.max(7, Math.floor(terminalRows / 3)))
      boardHeightReduction = previewHeight
    } else if (terminalColumns >= MIN_COLS_SIDE_PREVIEW) {
      previewLayout = "side"
    }
  }

  return (
    // @ts-expect-error ErrorBoundary class component vs OpenTUI JSX type mismatch (runtime-compatible)
    <ErrorBoundary>
      <DbContext.Provider value={db}>
        <ToastContext.Provider value={toastState}>
        <box flexDirection="column" width="100%" height={terminalRows} backgroundColor={theme.bg_1}>
          <Header boardId={state.currentBoardId} filters={filterHook.filters} activeFilterCount={filterHook.activeFilterCount} searchTerm={filterHook.filters.search} sortField={sortField} />

          <Toast />

          {dbError && (
            <ErrorBanner
              error={dbError}
              onRetry={() => {
                setDbError(null)
                forceRefresh()
              }}
              onDismiss={() => renderer.destroy()}
            />
          )}

          {isBoardVisible && (
            <>
              {state.uiMode === "text-filter" && (
                <TextFilterBar
                  initialValue={filterHook.filters.search || ""}
                  onSearch={filterHook.setSearch}
                  onClose={() => setState((prev) => ({ ...prev, uiMode: "board" }))}
                />
              )}
              {previewLayout === "side" ? (
                <box flexDirection="row" flexGrow={1}>
                  <box flexGrow={1}>
                    {renderBoardView()}
                  </box>
                  <TaskPreview task={previewTask} orientation="side" />
                </box>
              ) : (
                <>
                  {renderBoardView(boardHeightReduction)}
                  {previewLayout === "bottom" && (
                    <TaskPreview task={previewTask} orientation="bottom" maxHeight={previewHeight} />
                  )}
                </>
              )}
            </>
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
              forceRefresh()
            }}
            onDelete={(_taskId) => {
              setState((prev) => ({ ...prev, uiMode: "confirm-delete", deleteReturnMode: "detail" }))
            }}
            onUnarchive={(taskId) => {
              actions.undeleteTask(taskId)
              forceRefresh()
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
            initialStatus={currentLaneRef.current}
            onSubmit={(data) => {
              const created = actions.createNewTask(state.currentBoardId, data.title, data.description, data.priority, state.createParent?.id, data.status, data.type)
              showToast("Task created", `Title: ${data.title}`)
              setState((prev) => ({ ...prev, uiMode: "board", createParent: undefined, pendingFocusTaskId: created.id }))
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
                actions.updateTaskData(state.selectedTask.id, data.title, data.description, data.priority, data.type, data.solution || null)
                showToast("Task updated", `Title: ${data.title}`)
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

        {state.uiMode === "theme-picker" && (
          <ThemePicker
            onPreview={forceRefresh}
            onSelect={(themeName, appearance) => {
              saveGlobalConfig({ theme: { name: themeName, appearance } })
              showToast("Theme changed", `${themeName} (${appearance})`)
              setState((prev) => ({ ...prev, uiMode: "board" }))
            }}
            onCancel={() => setState((prev) => ({ ...prev, uiMode: "board" }))}
          />
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

        {state.uiMode === "confirm-delete" && state.selectedTask && (
          <ConfirmDelete
            task={state.selectedTask}
            onConfirm={() => {
              if (state.selectedTask) {
                actions.deleteTask(state.selectedTask.id)
                highlightedTaskRef.current = undefined
                showToast("Task deleted", `Title: ${state.selectedTask.title}`)
              }
              setState((prev) => ({ ...prev, selectedTask: undefined, uiMode: "board", deleteReturnMode: undefined }))
            }}
            onCancel={() => {
              const returnMode = state.deleteReturnMode || "board"
              setState((prev) => ({ ...prev, uiMode: returnMode, deleteReturnMode: undefined }))
            }}
          />
        )}



        {state.uiMode === "create-release" && (
          <CreateRelease
            doneTasks={
              state.currentBoardId
                ? getTaskCards(db, state.currentBoardId).filter((c) => c.status === "done" && c.parentId === null)
                : []
            }
            allBoardTasks={
              state.currentBoardId
                ? getTaskCards(db, state.currentBoardId)
                : []
            }
            versionFiles={detectVersionFiles(repoRoot)}
            onSubmit={(data) => {
              if (state.currentBoardId) {
                // Write version if bump was requested
                if (data.versionBump) {
                  writeVersion(data.versionBump.path, data.versionBump.file, data.versionBump.newVersion)
                }
                createRelease(db, {
                  boardId: state.currentBoardId,
                  name: data.name,
                  description: data.description || undefined,
                  versionInfo: data.versionBump
                    ? { file: data.versionBump.file, oldVersion: data.versionBump.oldVersion, newVersion: data.versionBump.newVersion }
                    : undefined,
                  taskIds: data.taskIds,
                })
                showToast("Release created", data.name)
              }
              setState((prev) => ({ ...prev, uiMode: "board" }))
            }}
            onCancel={() => setState((prev) => ({ ...prev, uiMode: "board" }))}
          />
        )}

        {state.uiMode === "releases" && (
          <ReleasesView
            releases={state.currentBoardId ? getReleases(db, state.currentBoardId) : []}
            getReleaseTasks={(releaseId) => getReleaseTopLevelTasks(db, releaseId)}
            getTaskSubtasks={(taskId) => getReleaseTaskSubtasks(db, taskId)}
            onRestoreTask={(taskId) => {
              restoreTaskFromRelease(db, taskId)
              forceRefresh()
            }}
            onRestoreAll={(releaseId) => {
              const count = restoreAllFromRelease(db, releaseId)
              showToast("Tasks restored", `${count} task${count !== 1 ? "s" : ""} moved to board`)
              forceRefresh()
            }}
            onDeleteRelease={(releaseId) => {
              const count = deleteRelease(db, releaseId)
              showToast("Release deleted", `${count} task${count !== 1 ? "s" : ""} restored to board`)
              forceRefresh()
            }}
            onBack={() => setState((prev) => ({ ...prev, uiMode: "board" }))}
            inputActive={state.uiMode === "releases"}
          />
        )}
      </box>
    </ToastContext.Provider>
    </DbContext.Provider>
  </ErrorBoundary>
  )
}
