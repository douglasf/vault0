import React, { useState } from "react"
import type { KeyEvent, SelectOption } from "@opentui/core"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"
import type { Task } from "../lib/types.js"
import { useDb } from "../lib/db-context.js"
import { getTasksByStatus } from "../db/queries.js"
import { VISIBLE_STATUSES } from "../lib/constants.js"
import { getStatusLabel, truncateText } from "../lib/format.js"
import { theme } from "../lib/theme.js"
import { ModalOverlay } from "./ModalOverlay.js"

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

  const selectOptions: SelectOption[] = availableTasks.map((task) => ({
    name: `${truncateText(task.title, 45)} [${getStatusLabel(task.status)}]`,
    description: "",
    value: task.id,
  }))

  useActiveKeyboard((event: KeyEvent) => {
    if (event.name === "backspace" || event.name === "delete") {
      setSearchFilter((s) => s.slice(0, -1))
    } else if (event.raw && event.raw.length === 1 && !event.ctrl && !event.meta && /[a-zA-Z0-9 _\-]/.test(event.raw)) {
      setSearchFilter((s) => s + event.raw)
    }
  })

  return (
    <ModalOverlay size="medium" title="Add Dependency" onClose={onCancel}>
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
          <select
            options={selectOptions}
            focused={true}
            height={Math.min(10, selectOptions.length)}
            showDescription={false}
            showScrollIndicator={availableTasks.length > 10}
            backgroundColor={theme.bg_1}
            textColor={theme.dim_0}
            selectedBackgroundColor={theme.cyan}
            selectedTextColor={theme.bg_1}
            focusedBackgroundColor={theme.bg_1}
            onSelect={(_index: number, option: SelectOption | null) => {
              if (option?.value) {
                onSelectDependency(option.value)
              }
            }}
          />
        )}
      </box>

      <box marginTop={1}>
        <text fg={theme.dim_0}>↑/↓: navigate  Enter: add  Esc: cancel</text>
      </box>
    </ModalOverlay>
  )
}
