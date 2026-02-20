import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import type { Task, Status } from "../lib/types.js"
import { useDb } from "../lib/db-context.js"
import { getTasksByStatus } from "../db/queries.js"
import { VISIBLE_STATUSES, STATUS_LABELS } from "../lib/constants.js"
import { getStatusColor } from "../lib/theme.js"

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

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(availableTasks.length - 1, i + 1))
    } else if (key.return) {
      if (availableTasks[selectedIndex]) {
        onSelectDependency(availableTasks[selectedIndex].id)
      }
    } else if (key.escape) {
      onCancel()
    } else if (key.backspace || key.delete) {
      setSearchFilter((s) => s.slice(0, -1))
      setSelectedIndex(0)
    } else if (input && input.length === 1 && /[a-zA-Z0-9 _\-]/.test(input)) {
      setSearchFilter((s) => s + input)
      setSelectedIndex(0)
    }
  })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Text bold color="cyan">Add Dependency</Text>

      <Box marginTop={1}>
        <Text dimColor>Search: </Text>
        {searchFilter ? (
          <Text>{searchFilter}</Text>
        ) : (
          <Text dimColor>(type to filter)</Text>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        {availableTasks.length === 0 ? (
          <Text dimColor>No matching tasks</Text>
        ) : (
          visibleTasks.map((task, i) => {
            const globalIndex = scrollStart + i
            const isSelected = globalIndex === selectedIndex
            return (
              <Box key={task.id}>
                <Text
                  color={getStatusColor(task.status)}
                  inverse={isSelected}
                >
                  {isSelected ? "▸ " : "  "}
                  {task.title.substring(0, 45)} [{STATUS_LABELS[task.status as Status] || task.status}]
                </Text>
              </Box>
            )
          })
        )}
      </Box>

      {availableTasks.length > maxVisible && (
        <Box marginTop={1}>
          <Text dimColor>
            {scrollStart + 1}–{Math.min(scrollStart + maxVisible, availableTasks.length)} of {availableTasks.length}
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>↑/↓: navigate  Enter: add  Esc: cancel</Text>
      </Box>
    </Box>
  )
}
