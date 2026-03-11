import { useState, useCallback, useEffect, useRef } from "react"
import { execSync } from "node:child_process"
import { useRenderer, useTerminalDimensions } from "@opentui/react"
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
import { DependencyPicker } from "./DependencyPicker.js"
import { DependencyRemover } from "./DependencyRemover.js"
import { ConfirmDelete } from "./ConfirmDelete.js"
import { ConfirmDeleteRelease } from "./ConfirmDeleteRelease.js"
import { CreateRelease } from "./CreateRelease.js"
import { ReleasesView } from "./ReleasesView.js"
import { ErrorBanner } from "./ErrorBanner.js"
import { Toast } from "./Toast.js"
import { theme } from "../lib/theme.js"
import { saveGlobalConfig } from "../lib/config.js"
import { ThemePicker } from "./ThemePicker.js"
import { useTaskActions } from "../hooks/useTaskActions.js"
import { useFilters } from "../hooks/useFilters.js"
import { useDbWatcher } from "../hooks/useDbWatcher.js"
import { useRepoStatus } from "../hooks/useRepoStatus.js"
import { parseTags } from "../lib/tags.js"

import { useKeybindScope } from "../hooks/useKeybindScope.js"
import { useKeybind } from "../hooks/useKeybind.js"
import { SCOPE_PRIORITY } from "../lib/keybind-registry.js"
import { useToastState } from "../hooks/useToast.js"
import type { Task, Status, SortField, ReleaseWithTaskCount } from "../lib/types.js"
import type { DbError } from "../lib/db-errors.js"
import { getBoards, getTaskCards, getReleases, getReleaseTopLevelTasks, getReleaseTaskSubtasks, createRelease, restoreTaskFromRelease, restoreAllFromRelease, deleteRelease, addDependency, removeDependency, getTaskDetail } from "../db/queries.js"
import { copyToClipboard } from "../lib/clipboard.js"
import { errorMessage } from "../lib/format.js"
import { SORT_FIELDS } from "../lib/constants.js"
import { detectVersionFiles, writeVersion } from "../lib/version-detect.js"

export interface AppProps {
  db: Vault0Database
  dbPath: string
  repoRoot: string
  config?: import("../lib/config.js").Vault0Config
}

export type UIMode = "board" | "releases" | "detail" | "create" | "edit" | "status-picker" | "filter" | "text-filter" | "confirm-delete" | "theme-picker" | "create-release" | "detail-dep-picker" | "detail-dep-remover" | "detail-confirm-delete" | "releases-confirm-delete"

/** Modal overlay modes — board stays mounted but input is routed to the overlay */
const MODAL_OVERLAY_MODES: ReadonlySet<UIMode> = new Set(["confirm-delete", "status-picker", "filter", "theme-picker", "create", "edit", "create-release"])

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
  /** The release targeted for deletion confirmation */
  selectedRelease?: ReleaseWithTaskCount
  /** The UI mode to return to if the user cancels a delete confirmation */
  deleteReturnMode?: UIMode
  /** When set, the board will focus this task after the next render */
  pendingFocusTaskId?: string
  /** Help overlay is independent of uiMode — it can appear on top of any view */
  showHelp?: boolean
}

export function App({ db, dbPath, repoRoot, config }: AppProps) {
  return (
    // @ts-expect-error ErrorBoundary class component vs OpenTUI JSX type mismatch (runtime-compatible)
    <ErrorBoundary>
      <DbContext.Provider value={db}>
        <AppContent db={db} dbPath={dbPath} repoRoot={repoRoot} config={config} />
      </DbContext.Provider>
    </ErrorBoundary>
  )
}

function AppContent({ db, dbPath, repoRoot, config }: AppProps) {
  const renderer = useRenderer()
  const { width: terminalColumns, height: terminalRows } = useTerminalDimensions()
  const [state, setState] = useState<AppState>({
    currentBoardId: "",
    uiMode: "board",
  })

  const actions = useTaskActions(config?.lanePolicies)
  const filterHook = useFilters()
  const repoStatus = useRepoStatus(repoRoot)

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

  // App-level input is active only in board mode (not during overlays or help).
  const appInputActive = state.uiMode === "board" && !state.showHelp

  // Board input is active only in pure board mode (not during overlays, text-filter, or help)
  const boardInputActive = state.uiMode === "board" && !state.showHelp

  // ── New keybinding system: root scope (always active) ────────────────
  useKeybindScope("root", { priority: SCOPE_PRIORITY.ROOT })

  useKeybind("root", "?", useCallback(() => {
    setState((prev) => ({ ...prev, showHelp: true }))
  }, []), { description: "Show help" })

  useKeybind("root", "q", useCallback(() => {
    renderer.destroy()
  }, [renderer]), { description: "Quit", when: state.uiMode === "board" && !state.showHelp })

  // ── New keybinding system: board scope (active only in board mode) ──
  useKeybindScope("board", { priority: SCOPE_PRIORITY.VIEW, active: appInputActive })

  useKeybind("board", "a", useCallback(() => {
    setState((prev) => ({ ...prev, uiMode: "create", createParent: undefined }))
  }, []), { description: "Create task" })

  useKeybind("board", "A", useCallback(() => {
    const task = highlightedTaskRef.current
    if (task && !task.parentId) {
      setState((prev) => ({ ...prev, uiMode: "create", createParent: task }))
    }
  }, []), { description: "Create subtask" })

  useKeybind("board", "e", useCallback(() => {
    const task = highlightedTaskRef.current
    if (task) {
      setState((prev) => ({ ...prev, selectedTask: task, uiMode: "edit" }))
    }
  }, []), { description: "Edit task" })

  useKeybind("board", "d", useCallback(() => {
    const task = highlightedTaskRef.current
    if (task) {
      setState((prev) => ({ ...prev, selectedTask: task, uiMode: "confirm-delete", deleteReturnMode: "board" }))
    }
  }, []), { description: "Delete task" })

  useKeybind("board", "u", useCallback(() => {
    const task = highlightedTaskRef.current
    if (task && task.archivedAt !== null) {
      actions.undeleteTask(task.id)
      forceRefresh()
    }
  }, [actions, forceRefresh]), { description: "Undelete task" })

  useKeybind("board", "s", useCallback(() => {
    const task = highlightedTaskRef.current
    if (task) {
      setState((prev) => ({ ...prev, selectedTask: task, uiMode: "status-picker" }))
    }
  }, []), { description: "Status picker" })

  useKeybind("board", "p", useCallback(() => {
    const task = highlightedTaskRef.current
    if (task) {
      actions.cyclePriority(task.id)
      forceRefresh()
    }
  }, [actions, forceRefresh]), { description: "Cycle priority" })

  useKeybind("board", "f", useCallback(() => {
    setState((prev) => ({ ...prev, uiMode: "text-filter" }))
  }, []), { description: "Text filter" })

  useKeybind("board", "F", useCallback(() => {
    setState((prev) => ({ ...prev, uiMode: "filter" }))
  }, []), { description: "Filter bar" })


  useKeybind("board", "c", useCallback(() => {
    const task = highlightedTaskRef.current
    if (task) {
      const ok = copyToClipboard(task.id)
      showToast(ok ? "Copied" : "Copy failed", ok ? task.id : "Could not copy to clipboard")
    }
  }, [showToast]), { description: "Copy task ID" })

  useKeybind("board", "h", useCallback(() => {
    setHideSubtasks((prev) => !prev)
  }, []), { description: "Toggle hide subtasks" })

  useKeybind("board", "S", useCallback(() => {
    setSortField((prev) => {
      const idx = SORT_FIELDS.indexOf(prev)
      return SORT_FIELDS[(idx + 1) % SORT_FIELDS.length]
    })
  }, []), { description: "Cycle sort" })

  useKeybind("board", "v", useCallback(() => {
    setPreviewVisible((prev) => !prev)
  }, []), { description: "Toggle preview" })

  useKeybind("board", "t", useCallback(() => {
    setState((prev) => ({ ...prev, uiMode: "theme-picker" }))
  }, []), { description: "Theme picker" })

  useKeybind("board", "R", useCallback(() => {
    setState((prev) => ({ ...prev, uiMode: "create-release" }))
  }, []), { description: "Create release" })

  useKeybind("board", "W", useCallback(() => {
    setState((prev) => ({ ...prev, uiMode: "releases" }))
  }, []), { description: "Releases view" })

  // Escape dismisses toasts when in board mode (doesn't interfere with modal overlays)
  useKeybind("board", "Escape", useCallback(() => {
    if (toastState.toasts.length > 0) {
      toastState.dismissAll()
    }
  }, [toastState]), { description: "Dismiss toasts" })

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
        <ToastContext.Provider value={toastState}>
        <box flexDirection="column" width="100%" height={terminalRows} backgroundColor={theme.bg_1}>
          <Header boardId={state.currentBoardId} filters={filterHook.filters} activeFilterCount={filterHook.activeFilterCount} searchTerm={filterHook.filters.search} sortField={sortField} repoStatus={repoStatus} />

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
              {/* REGRESSION: 01KJ8KXDQWRXSHH71F90TF0WGP
                * The Board must always be at the same tree position regardless of preview layout.
                * DO NOT restructure this as separate if/else branches that change the JSX tree shape.
                * Changing the tree structure causes React to remount the Board, resetting navigation state.
                * Preview toggles on/off as a sibling, never by restructuring the parent wrapper. */}
              <box flexDirection="row" flexGrow={1}>
                <box flexGrow={1}>
                  {renderBoardView(previewLayout === "side" ? 0 : boardHeightReduction)}
                </box>
                {previewLayout === "side" && (
                  <TaskPreview task={previewTask} orientation="side" />
                )}
              </box>
              {previewLayout === "bottom" && (
                <TaskPreview task={previewTask} orientation="bottom" maxHeight={previewHeight} />
              )}
            </>
          )}

        {(state.uiMode === "detail" || state.uiMode === "detail-dep-picker" || state.uiMode === "detail-dep-remover" || state.uiMode === "detail-confirm-delete") && state.selectedTask && (
          <TaskDetail
            taskId={state.selectedTask.id}
            inputActive={state.uiMode === "detail" && !state.showHelp}
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
              forceRefresh()
            }}
            onDelete={(_taskId) => {
              setState((prev) => ({ ...prev, uiMode: "detail-confirm-delete" }))
            }}
            onUnarchive={(taskId) => {
              actions.undeleteTask(taskId)
              forceRefresh()
            }}
            onCreateSubtask={(parent) => {
              setState((prev) => ({ ...prev, uiMode: "create", createParent: parent }))
            }}
            onShowDependencyPicker={() =>
              setState((prev) => ({ ...prev, uiMode: "detail-dep-picker" }))
            }
            onShowDependencyRemover={() =>
              setState((prev) => ({ ...prev, uiMode: "detail-dep-remover" }))
            }
            onShowDeleteConfirm={() =>
              setState((prev) => ({ ...prev, uiMode: "detail-confirm-delete" }))
            }
          />
        )}

        {state.uiMode === "create" && (
          <TaskForm
            mode="create"
            parentTitle={state.createParent?.title}
            initialStatus={currentLaneRef.current}
            repoRoot={repoRoot}
            onSubmit={(data) => {
              const tags = data.tags ? parseTags(data.tags) : undefined
              const created = actions.createNewTask(state.currentBoardId, data.title, data.description, data.priority, state.createParent?.id, data.status, data.type, tags)
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
            repoRoot={repoRoot}
            onSubmit={(data) => {
              if (state.selectedTask) {
                const tags = data.tags ? parseTags(data.tags) : undefined
                actions.updateTaskData(state.selectedTask.id, data.title, data.description, data.priority, data.type, data.solution || null, tags)
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

        {state.showHelp && (
          <HelpOverlay
            onClose={() => setState((prev) => ({ ...prev, showHelp: false }))}
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
            onCancel={() => {
              forceRefresh()
              setState((prev) => ({ ...prev, uiMode: "board" }))
            }}
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



        {state.uiMode === "detail-dep-picker" && state.selectedTask && (
          <DependencyPicker
            currentTaskId={state.selectedTask.id}
            boardId={getTaskDetail(db, state.selectedTask.id).boardId}
            existingDependencyIds={getTaskDetail(db, state.selectedTask.id).dependsOn.map((d) => d.id)}
            onSelectDependency={(depId) => {
              try {
                if (state.selectedTask) addDependency(db, state.selectedTask.id, depId)
              } catch (error) {
                showToast("Dependency error", errorMessage(error))
              }
              setState((prev) => ({ ...prev, uiMode: "detail" }))
            }}
            onCancel={() => setState((prev) => ({ ...prev, uiMode: "detail" }))}
          />
        )}

        {state.uiMode === "detail-dep-remover" && state.selectedTask && (
          <DependencyRemover
            dependencyList={getTaskDetail(db, state.selectedTask.id).dependsOn}
            onSelect={(depId) => {
              try {
                if (state.selectedTask) removeDependency(db, state.selectedTask.id, depId)
              } catch (error) {
                showToast("Dependency error", errorMessage(error))
              }
              setState((prev) => ({ ...prev, uiMode: "detail" }))
            }}
            onCancel={() => setState((prev) => ({ ...prev, uiMode: "detail" }))}
          />
        )}

        {state.uiMode === "detail-confirm-delete" && state.selectedTask && (
          <ConfirmDelete
            task={state.selectedTask}
            onConfirm={() => {
              if (state.selectedTask) {
                actions.deleteTask(state.selectedTask.id)
                highlightedTaskRef.current = undefined
                showToast("Task deleted", `Title: ${state.selectedTask.title}`)
              }
              setState((prev) => ({ ...prev, selectedTask: undefined, uiMode: "board" }))
            }}
            onCancel={() => setState((prev) => ({ ...prev, uiMode: "detail" }))}
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
                  const versionChanged = data.versionBump.oldVersion !== data.versionBump.newVersion

                  if (data.commitBump && versionChanged) {
                    // Smart commit: check for uncommitted changes before writing
                    try {
                      const statusBefore = execSync("git status --porcelain", { cwd: repoRoot, encoding: "utf-8" }).trim()
                      if (statusBefore) {
                        showToast("❌ Working tree has uncommitted changes", "Please commit or stash them first.")
                        return
                      }
                    } catch {
                      showToast("❌ Failed to check git status", "Is this a git repository?")
                      return
                    }

                    // Working tree is clean — write the version bump
                    writeVersion(data.versionBump.path, data.versionBump.file, data.versionBump.newVersion)

                    // Commit the version bump
                    try {
                      execSync(`git add ${data.versionBump.file}`, { cwd: repoRoot, encoding: "utf-8" })
                      execSync(`git commit -m "chore: bump version to ${data.versionBump.newVersion}"`, { cwd: repoRoot, encoding: "utf-8" })
                    } catch (error) {
                      // Revert on commit failure
                      try {
                        execSync(`git checkout -- ${data.versionBump.file}`, { cwd: repoRoot, encoding: "utf-8" })
                      } catch { /* best effort revert */ }
                      const message = error instanceof Error ? error.message : String(error)
                      showToast("❌ Failed to commit version bump", message)
                      return
                    }
                  } else {
                    // No commit requested or version unchanged — just write
                    writeVersion(data.versionBump.path, data.versionBump.file, data.versionBump.newVersion)
                  }
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

        {(state.uiMode === "releases" || state.uiMode === "releases-confirm-delete") && (
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
            onShowDeleteConfirmation={(release) => {
              setState((prev) => ({ ...prev, uiMode: "releases-confirm-delete", selectedRelease: release }))
            }}
            onBack={() => setState((prev) => ({ ...prev, uiMode: "board" }))}
            inputActive={state.uiMode === "releases" && !state.showHelp}
          />
        )}

        {state.uiMode === "releases-confirm-delete" && state.selectedRelease && (
          <ConfirmDeleteRelease
            release={state.selectedRelease}
            onConfirm={() => {
              if (state.selectedRelease) {
                const count = deleteRelease(db, state.selectedRelease.id)
                showToast("Release deleted", `${count} task${count !== 1 ? "s" : ""} restored to board`)
                forceRefresh()
              }
              setState((prev) => ({ ...prev, selectedRelease: undefined, uiMode: "releases" }))
            }}
            onCancel={() => setState((prev) => ({ ...prev, selectedRelease: undefined, uiMode: "releases" }))}
          />
        )}
      </box>
    </ToastContext.Provider>
  )
}
