import { useRef, useState } from "react"
import type { KeyEvent, ScrollBoxRenderable, SelectOption } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useKeyboard } from "@opentui/react"
import { useKeybindScope } from "../hooks/useKeybindScope.js"
import { SCOPE_PRIORITY } from "../lib/keybind-registry.js"
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
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const { height: terminalRows } = useTerminalDimensions()

  // Modal chrome: 4 (modal margin) + 2 (padding) + 1 (title) = 7
  // Top area outside scrollbox: 1 (search text)
  // Bottom area outside scrollbox: 1 (marginTop) + 1 (footer) = 2
  const chromeHeight = 7 + 1 + 2

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

  // ── Adaptive scroll height (shrink-to-content) ─────────────────────────
  const contentHeight = availableTasks.length === 0 ? 1 : Math.min(10, selectOptions.length)
  const availableHeight = Math.max(3, terminalRows - chromeHeight)
  const needsScroll = contentHeight > availableHeight
  const scrollHeight = needsScroll ? availableHeight : contentHeight

  // ── Auto-scroll: reset to top when search filter changes ────────────
  const prevFilter = useRef(searchFilter)
  if (prevFilter.current !== searchFilter) {
    prevFilter.current = searchFilter
    scrollRef.current?.scrollTo(0)
  }

  const depPickerScope = useKeybindScope("dep-picker", {
    priority: SCOPE_PRIORITY.WIDGET,
    opaque: false,
  })

  // Character input for search filter — uses useKeyboard directly since
  // the keybind registry doesn't handle arbitrary character input
  useKeyboard((event: KeyEvent) => {
    if (event.name === "backspace" || event.name === "delete") {
      setSearchFilter((s) => s.slice(0, -1))
    } else if (event.raw && event.raw.length === 1 && !event.ctrl && !event.meta && /[a-zA-Z0-9 _\-]/.test(event.raw)) {
      setSearchFilter((s) => s + event.raw)
    }
  })

  return (
    <ModalOverlay size="medium" title="Add Dependency" onClose={onCancel}>
      <box>
        <text fg={theme.dim_0}>Search: </text>
        {searchFilter ? (
          <text>{searchFilter}</text>
        ) : (
          <text fg={theme.dim_0}>(type to filter)</text>
        )}
      </box>

      <scrollbox ref={scrollRef} scrollY focused={false} flexGrow={0} flexShrink={1} height={scrollHeight}>
        <box flexDirection="column">
          {availableTasks.length === 0 ? (
            <text fg={theme.dim_0}>No matching tasks</text>
          ) : (
            <select
              options={selectOptions}
              focused={true}
              height={Math.min(10, selectOptions.length)}
              showDescription={false}
              showScrollIndicator={availableTasks.length > 10}
              textColor={theme.dim_0}
              backgroundColor={theme.bg_1}
              selectedBackgroundColor={theme.cyan}
              selectedTextColor={theme.bg_1}
              onSelect={(_index: number, option: SelectOption | null) => {
                if (option?.value) {
                  onSelectDependency(option.value)
                }
              }}
            />
          )}
        </box>
      </scrollbox>

      <box marginTop={1}>
        <text fg={theme.dim_0}>↑/↓: navigate  Enter: add  Esc: cancel</text>
      </box>
    </ModalOverlay>
  )
}
