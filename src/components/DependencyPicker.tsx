import React, { useState } from "react"
import { TextAttributes } from "@opentui/core"
import type { KeyEvent } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import type { Task, Status } from "../lib/types.js"
import { useDb } from "../lib/db-context.js"
import { getTasksByStatus } from "../db/queries.js"
import { VISIBLE_STATUSES, STATUS_LABELS } from "../lib/constants.js"
import { getStatusColor } from "../lib/theme.js"
import { theme } from "../lib/theme.js"

export interface DependencyPickerProps {
  currentTaskId: string
  boardId: string
  existingDependencyIds: string[]
  onSelectDependency: (dependsOnId: string) => void
  onCancel: () => void
}

export function DependencyPicker({
  currentTaskId,
  boardId,
  existingDependencyIds,
  onSelectDependency,
  onCancel,
}: DependencyPickerProps) {
  const db = useDb()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchFilter, setSearchFilter] = useState("")

  // Fetch all tasks across visible statuses (single DB call)
  const tasksByStatus = getTasksByStatus(db, boardId)
  const allTasks: Task[] = []
  for (const status of VISIBLE_STATUSES) {
    allTasks.push(...(tasksByStatus.get(status) || []))
  }

  // Filter out current task, existing dependencies, and apply search
  const existingSet = new Set(existingDependencyIds)
  const availableTasks = allTasks.filter(
    (t) =>
      t.id !== currentTaskId &&
      !existingSet.has(t.id) &&
      t.title.toLowerCase().includes(searchFilter.toLowerCase()),
  )

  // Scrollable window: keep selected item roughly centered
  const maxVisible = 10
  const idealStart = selectedIndex - Math.floor(maxVisible / 2)
  const scrollStart = Math.max(0, Math.min(idealStart, Math.max(0, availableTasks.length - maxVisible)))
  const visibleTasks = availableTasks.slice(scrollStart, scrollStart + maxVisible)

  useKeyboard((event: KeyEvent) => {
    if (event.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (event.name === "down") {
      setSelectedIndex((i) => Math.min(availableTasks.length - 1, i + 1))
    } else if (event.name === "return") {
      if (availableTasks[selectedIndex]) {
        onSelectDependency(availableTasks[selectedIndex].id)
      }
    } else if (event.name === "escape") {
      onCancel()
    } else if (event.name === "backspace" || event.name === "delete") {
      setSearchFilter((s) => s.slice(0, -1))
      setSelectedIndex(0)
    } else if (event.raw && event.raw.length === 1 && !event.ctrl && !event.meta && /[a-zA-Z0-9 _\-]/.test(event.raw)) {
      setSearchFilter((s) => s + event.raw)
      setSelectedIndex(0)
    }
  })

  return (
    <box flexDirection="column" backgroundColor={theme.bg_1} paddingX={2} paddingY={1}>
      <text attributes={TextAttributes.BOLD} fg={theme.cyan}>Add Dependency</text>

      <box marginTop={1}>
        <text fg={theme.dim_0}>Search: </text>
        {searchFilter ? (
          <text>{searchFilter}</text>
        ) : (
          <text fg={theme.dim_0}>(type to filter)</text>
        )}
      </box>

      <box marginTop={1} flexDirection="column">
        {availableTasks.length === 0 ? (
          <text fg={theme.dim_0}>No matching tasks</text>
        ) : (
          visibleTasks.map((task, i) => {
            const globalIndex = scrollStart + i
            const isSelected = globalIndex === selectedIndex
            return (
              <box key={task.id}>
                <text
                  fg={isSelected ? theme.bg_1 : getStatusColor(task.status)}
                  bg={isSelected ? getStatusColor(task.status) : undefined}
                >
                  {isSelected ? "▸ " : "  "}
                  {task.title.substring(0, 45)} [{STATUS_LABELS[task.status as Status] || task.status}]
                </text>
              </box>
            )
          })
        )}
      </box>

      {availableTasks.length > maxVisible && (
        <box marginTop={1}>
          <text fg={theme.dim_0}>
            {scrollStart + 1}–{Math.min(scrollStart + maxVisible, availableTasks.length)} of {availableTasks.length}
          </text>
        </box>
      )}

      <box marginTop={1}>
        <text fg={theme.dim_0}>↑/↓: navigate  Enter: add  Esc: cancel</text>
      </box>
    </box>
  )
}
