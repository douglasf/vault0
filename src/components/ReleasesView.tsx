import { useState, useRef, useCallback } from "react"
import type { KeyEvent, ScrollBoxRenderable, TabSelectRenderable, TabSelectOption } from "@opentui/core"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"
import type { ReleaseWithTaskCount, Task, TaskCard as TaskCardType } from "../lib/types.js"
import { theme, getMarkdownSyntaxStyle } from "../lib/theme.js"
import { getStatusLabel, getPriorityLabel, formatDate } from "../lib/format.js"
import { getPriorityColor, getStatusColor } from "../lib/theme.js"
import { TaskCard } from "./TaskCard.js"

// ── Types ───────────────────────────────────────────────────────────

export interface ReleasesViewProps {
  releases: ReleaseWithTaskCount[]
  /** Fetches top-level tasks for a given release ID */
  getReleaseTasks: (releaseId: string) => Task[]
  /** Fetches subtasks for a given task ID */
  getTaskSubtasks: (taskId: string) => Task[]
  /** Restore a single task from a release to the board */
  onRestoreTask: (taskId: string) => void
  /** Restore all tasks from a release */
  onRestoreAll: (releaseId: string) => void
  /** Delete a release (restore all tasks, remove release record) */
  onDeleteRelease: (releaseId: string) => void
  /** Show delete confirmation modal at App level */
  onShowDeleteConfirmation: (release: ReleaseWithTaskCount) => void
  /** Go back to the board */
  onBack: () => void
  /** Whether keyboard input is active */
  inputActive: boolean
}

type Column = "releases" | "tasks" | "detail"

const MIN_COLS_3COL = 120

// ── Component ───────────────────────────────────────────────────────

/**
 * Full-screen 3-column releases view.
 *
 * **Desktop (≥120 cols):** Left: release list (25%), Middle: release metadata + tasks (25%),
 * Right: task detail (50%).
 *
 * **Narrow (<120 cols):** Tab-based navigation between the three panels.
 */
export function ReleasesView({
  releases,
  getReleaseTasks,
  getTaskSubtasks,
  onRestoreTask,
  onRestoreAll,
  onDeleteRelease,
  onShowDeleteConfirmation,
  onBack,
  inputActive,
}: ReleasesViewProps) {
  const { width: terminalCols, height: terminalRows } = useTerminalDimensions()
  const isNarrow = terminalCols < MIN_COLS_3COL

  const releasesScrollRef = useRef<ScrollBoxRenderable>(null)
  const tasksScrollRef = useRef<ScrollBoxRenderable>(null)
  const detailScrollRef = useRef<ScrollBoxRenderable>(null)
  const tabRef = useRef<TabSelectRenderable>(null)

  const [activeColumn, setActiveColumn] = useState<Column>("releases")
  const [selectedReleaseIdx, setSelectedReleaseIdx] = useState(0)
  const [selectedTaskIdx, setSelectedTaskIdx] = useState(0)

  const contentHeight = Math.max(3, terminalRows - 6)

  // Derived data
  const selectedRelease = releases[selectedReleaseIdx] ?? null
  const releaseTasks = selectedRelease ? getReleaseTasks(selectedRelease.id) : []
  const selectedTask = releaseTasks[selectedTaskIdx] ?? null
  const selectedTaskSubtasks = selectedTask ? getTaskSubtasks(selectedTask.id) : []

  // ── Navigation helpers ──────────────────────────────────────────

  const handleTabChange = useCallback((index: number) => {
    const cols: Column[] = ["releases", "tasks", "detail"]
    setActiveColumn(cols[index])
  }, [])

  const moveToColumn = useCallback((col: Column) => {
    setActiveColumn(col)
    if (isNarrow) {
      const idx = col === "releases" ? 0 : col === "tasks" ? 1 : 2
      tabRef.current?.setSelectedIndex(idx)
    }
  }, [isNarrow])

  const navigateRight = useCallback(() => {
    if (activeColumn === "releases" && selectedRelease) {
      moveToColumn("tasks")
      setSelectedTaskIdx(0)
    } else if (activeColumn === "tasks" && selectedTask) {
      moveToColumn("detail")
    }
  }, [activeColumn, selectedRelease, selectedTask, moveToColumn])

  const navigateLeft = useCallback(() => {
    if (activeColumn === "detail") {
      moveToColumn("tasks")
    } else if (activeColumn === "tasks") {
      moveToColumn("releases")
    }
  }, [activeColumn, moveToColumn])

  // ── Keyboard handler ──────────────────────────────────────────

  useActiveKeyboard((event: KeyEvent) => {
    if (event.name === "escape" || event.raw === "q") {
      if (activeColumn !== "releases") {
        navigateLeft()
        return
      }
      onBack()
      return
    }

    if (releases.length === 0) return

    if (activeColumn === "releases") {
      if (event.name === "up") {
        setSelectedReleaseIdx((prev) => {
          const next = Math.max(0, prev - 1)
          if (next !== prev) {
            releasesScrollRef.current?.scrollBy(-1)
            setSelectedTaskIdx(0)
          }
          return next
        })
      } else if (event.name === "down") {
        setSelectedReleaseIdx((prev) => {
          const next = Math.min(releases.length - 1, prev + 1)
          if (next !== prev) {
            releasesScrollRef.current?.scrollBy(1)
            setSelectedTaskIdx(0)
          }
          return next
        })
      } else if (event.name === "return" || event.name === "right" || event.raw === "l") {
        navigateRight()
      }
    } else if (activeColumn === "tasks") {
      if (event.name === "up") {
        setSelectedTaskIdx((prev) => {
          const next = Math.max(0, prev - 1)
          if (next !== prev) tasksScrollRef.current?.scrollBy(-1)
          return next
        })
      } else if (event.name === "down") {
        setSelectedTaskIdx((prev) => {
          const next = Math.min(releaseTasks.length - 1, prev + 1)
          if (next !== prev) tasksScrollRef.current?.scrollBy(1)
          return next
        })
      } else if (event.name === "return" || event.name === "right" || event.raw === "l") {
        navigateRight()
      } else if (event.name === "left" || event.raw === "h") {
        navigateLeft()
      }
    } else if (activeColumn === "detail") {
      if (event.name === "up") {
        detailScrollRef.current?.scrollBy(-1)
      } else if (event.name === "down") {
        detailScrollRef.current?.scrollBy(1)
      } else if (event.name === "pageup") {
        detailScrollRef.current?.scrollBy(-contentHeight)
      } else if (event.name === "pagedown") {
        detailScrollRef.current?.scrollBy(contentHeight)
      } else if (event.name === "left" || event.raw === "h") {
        navigateLeft()
      } else if (event.raw === "r") {
        // Restore selected task
        if (selectedTask) {
          onRestoreTask(selectedTask.id)
          // Adjust selection if needed
          if (selectedTaskIdx >= releaseTasks.length - 1) {
            setSelectedTaskIdx(Math.max(0, releaseTasks.length - 2))
          }
          if (releaseTasks.length <= 1) {
            moveToColumn("tasks")
          }
        }
      }
    }

    // X to delete release works from any column as long as a release is selected
    if (event.raw === "X" && selectedRelease) {
      onShowDeleteConfirmation(selectedRelease)
    }
  }, inputActive)

  // ── Empty state ───────────────────────────────────────────────

  if (releases.length === 0) {
    return (
      <box flexDirection="column" flexGrow={1} padding={1}>
        <text fg={theme.cyan} attributes={TextAttributes.BOLD}>
          Releases
        </text>
        <text> </text>
        <text fg={theme.dim_0}>
          No releases yet. Press R on the board to create one.
        </text>
        <text> </text>
        <text fg={theme.dim_0}>Esc: back to board</text>
      </box>
    )
  }

  // ── Helpers ────────────────────────────────────────────────────

  /** Convert a plain Task into a TaskCard shape for rendering */
  const toTaskCard = (task: Task): TaskCardType => {
    const subs = getTaskSubtasks(task.id)
    return {
      ...task,
      dependencyCount: 0,
      blockerCount: 0,
      subtaskTotal: subs.length,
      subtaskDone: subs.filter((s) => s.status === "done").length,
      isReady: false,
      isBlocked: false,
    }
  }

  /** Context-sensitive keyboard legend text */
  const legendText =
    activeColumn === "releases" ? "↑/↓: navigate  Enter/→: select release  X: delete release  Esc/q: board"
      : activeColumn === "tasks" ? "↑/↓: navigate  Enter/→: task detail  X: delete release  ←/h: releases  Esc: board"
        : "↑/↓: scroll  r: restore task  X: delete release  ←/h: tasks  Esc: board"

  // ── Panel renderers ───────────────────────────────────────────

  const renderReleasesPanel = (panelHeight: number, showBorder: boolean) => (
    <box flexDirection="column" flexGrow={showBorder ? undefined : 1} width={showBorder ? "25%" : "100%"} borderStyle={showBorder ? "single" : undefined} borderColor={activeColumn === "releases" ? theme.cyan : theme.dim_0}>
      <text fg={theme.cyan} attributes={TextAttributes.BOLD} marginLeft={1}>
        Releases ({releases.length})
      </text>
      <scrollbox ref={releasesScrollRef} scrollY flexGrow={1} height={panelHeight - 3} focused={false}>
        {releases.map((release, idx) => {
          const isSelected = idx === selectedReleaseIdx
          const versionInfo = release.versionInfo as { file: string; oldVersion: string; newVersion: string } | null
          return (
            <box key={release.id} flexDirection="column" paddingX={1} backgroundColor={isSelected && activeColumn === "releases" ? theme.bg_2 : undefined}>
              <text
                fg={isSelected && activeColumn === "releases" ? theme.fg_0 : isSelected ? theme.fg_1 : theme.dim_0}
                attributes={isSelected ? TextAttributes.BOLD : 0}
              >
                {isSelected ? "▸ " : "  "}
                {release.name}
                {versionInfo ? ` (${versionInfo.newVersion})` : ""}
              </text>
              {/* Date/count removed — shown in middle column metadata */}
            </box>
          )
        })}
      </scrollbox>
    </box>
  )

  const renderTasksPanel = (panelHeight: number, showBorder: boolean) => {
    if (!selectedRelease) {
      return (
        <box flexDirection="column" flexGrow={showBorder ? undefined : 1} width={showBorder ? "25%" : "100%"} borderStyle={showBorder ? "single" : undefined} borderColor={theme.dim_0}>
          <text fg={theme.dim_0} marginLeft={1}>Select a release</text>
        </box>
      )
    }

    const versionInfo = selectedRelease.versionInfo as { file: string; oldVersion: string; newVersion: string } | null

    return (
      <box flexDirection="column" flexGrow={showBorder ? undefined : 1} width={showBorder ? "25%" : "100%"} borderStyle={showBorder ? "single" : undefined} borderColor={activeColumn === "tasks" ? theme.cyan : theme.dim_0}>
        {/* Release metadata header */}
        <box flexDirection="column" paddingX={1}>
          <text fg={theme.cyan} attributes={TextAttributes.BOLD}>
            {selectedRelease.name}
          </text>
          <text fg={theme.dim_0}>
            {formatDate(selectedRelease.createdAt)}
          </text>
          {versionInfo && (
            <text fg={theme.fg_1}>
              {versionInfo.file}: {versionInfo.oldVersion} → {versionInfo.newVersion}
            </text>
          )}
          {selectedRelease.description && (
            <text fg={theme.fg_1}>{selectedRelease.description}</text>
          )}
          <text fg={theme.fg_1}>
            Tasks in release: {releaseTasks.length}
          </text>
        </box>

        {/* Separator */}
        <text fg={theme.dim_0} marginLeft={1}>──────────────────</text>

        {/* Task list */}
        <scrollbox ref={tasksScrollRef} scrollY flexGrow={1} height={panelHeight - 7} focused={false}>
          {releaseTasks.length === 0 ? (
            <text fg={theme.dim_0} marginLeft={1}>(all tasks restored)</text>
          ) : (
            releaseTasks.map((task, idx) => {
              const isSelected = idx === selectedTaskIdx
              return (
                <box key={task.id} paddingX={1} backgroundColor={isSelected && activeColumn === "tasks" ? theme.bg_2 : undefined}>
                  <TaskCard
                    task={toTaskCard(task)}
                    isSelected={isSelected && activeColumn === "tasks"}
                    isReady={false}
                    isBlocked={false}
                    showParentRef={false}
                  />
                </box>
              )
            })
          )}
        </scrollbox>
      </box>
    )
  }

  const renderDetailPanel = (panelHeight: number, showBorder: boolean) => {
    if (!selectedTask) {
      return (
        <box flexDirection="column" flexGrow={showBorder ? 1 : 1} width={showBorder ? "50%" : "100%"} borderStyle={showBorder ? "single" : undefined} borderColor={theme.dim_0}>
          <text fg={theme.dim_0} marginLeft={1}>Select a task to view details</text>
        </box>
      )
    }

    return (
      <box flexDirection="column" flexGrow={showBorder ? 1 : 1} width={showBorder ? "50%" : "100%"} borderStyle={showBorder ? "single" : undefined} borderColor={activeColumn === "detail" ? theme.cyan : theme.dim_0}>
        <scrollbox ref={detailScrollRef} scrollY flexGrow={1} height={panelHeight - 2} focused={false}>
          <box flexDirection="column" paddingX={1}>
            {/* Title */}
            <text fg={theme.fg_0} attributes={TextAttributes.BOLD}>
              {selectedTask.title}
            </text>

            {/* Fields */}
            <box flexDirection="row" marginTop={1}>
              <text fg={theme.dim_0}>Status: </text>
              <text fg={getStatusColor(selectedTask.status)}>
                {getStatusLabel(selectedTask.status)}
              </text>
            </box>
            <box flexDirection="row">
              <text fg={theme.dim_0}>Priority: </text>
              <text fg={getPriorityColor(selectedTask.priority)}>
                {getPriorityLabel(selectedTask.priority)}
              </text>
            </box>
            <box flexDirection="row">
              <text fg={theme.dim_0}>Created: </text>
              <text fg={theme.fg_1}>{formatDate(selectedTask.createdAt)}</text>
            </box>
            <box flexDirection="row">
              <text fg={theme.dim_0}>Updated: </text>
              <text fg={theme.fg_1}>{formatDate(selectedTask.updatedAt)}</text>
            </box>

            {/* Description */}
            {selectedTask.description && (
              <>
                <text fg={theme.dim_0} marginTop={1}>──────────────────</text>
                <markdown content={selectedTask.description} syntaxStyle={getMarkdownSyntaxStyle()} conceal={true} />
              </>
            )}

            {/* Subtasks */}
            {selectedTaskSubtasks.length > 0 && (
              <>
                <text fg={theme.blue} attributes={TextAttributes.BOLD} marginTop={1}>
                  Subtasks ({selectedTaskSubtasks.length})
                </text>
                {selectedTaskSubtasks.map((sub) => (
                  <box key={sub.id} flexDirection="row" marginLeft={2}>
                    <text fg={theme.fg_1}>
                      {sub.status === "done" ? "[x] " : "[ ] "}
                    </text>
                    <text fg={sub.status === "done" ? theme.dim_0 : theme.fg_1}>
                      {sub.title}
                    </text>
                  </box>
                ))}
              </>
            )}

          </box>
        </scrollbox>
      </box>
    )
  }

  // ── Narrow layout (tabbed) ────────────────────────────────────

  if (isNarrow) {
    const tabOptions: TabSelectOption[] = [
      { name: "Releases", description: "", value: "releases" },
      { name: "Release Detail", description: "", value: "tasks" },
      { name: "Task Detail", description: "", value: "detail" },
    ]

    return (
      <box flexDirection="column" flexGrow={1} padding={1}>
        <text fg={theme.dim_0} marginBottom={1}>{legendText}</text>
        <tab-select
          ref={tabRef}
          options={tabOptions}
          focused={false}
          onChange={handleTabChange}
          textColor={theme.fg_0}
          selectedTextColor={theme.fg_0}
          showDescription={false}
          showUnderline={true}
          wrapSelection={false}
          justifyContent="center"
          marginBottom={1}
        />

        {activeColumn === "releases" && renderReleasesPanel(contentHeight - 2, false)}
        {activeColumn === "tasks" && renderTasksPanel(contentHeight - 2, false)}
        {activeColumn === "detail" && renderDetailPanel(contentHeight - 2, false)}

      </box>
    )
  }

  // ── Desktop layout (3 columns) ────────────────────────────────

   return (
    <box flexDirection="column" flexGrow={1} padding={1}>
      <text fg={theme.dim_0} marginBottom={1}>{legendText}</text>
      <box flexDirection="row" flexGrow={1} height={contentHeight}>
        {renderReleasesPanel(contentHeight, true)}
        {renderTasksPanel(contentHeight, true)}
        {renderDetailPanel(contentHeight, true)}
      </box>

    </box>
  )
}
