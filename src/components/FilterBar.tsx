import { useState } from "react"
import { TextAttributes } from "@opentui/core"
import type { KeyEvent, SelectOption } from "@opentui/core"
import type { Filters, Status, Priority, Source } from "../lib/types.js"
import { VISIBLE_STATUSES, PRIORITY_ORDER, STATUS_LABELS, PRIORITY_LABELS } from "../lib/constants.js"
import { getStatusColor } from "../lib/theme.js"
import { theme } from "../lib/theme.js"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"

export interface FilterBarProps {
  filters: Filters
  onToggleStatus: (status: Status) => void
  onTogglePriority: (priority: Priority) => void
  onToggleSource: (source: Source) => void
  onToggleReady: () => void
  onToggleBlocked: () => void
  onToggleArchived: () => void
  onClear: () => void
  onClose: () => void
}

type SectionKey = "status" | "priority" | "source" | "toggles" | "actions"

const SECTIONS: SectionKey[] = ["status", "priority", "source", "toggles", "actions"]

const PRIORITIES = Object.keys(PRIORITY_ORDER) as Priority[]
const SOURCES: Source[] = ["manual", "opencode", "opencode-plan", "todo_md", "import"]
const TOGGLE_KEYS = ["readyOnly", "blockedOnly", "showArchived"] as const
const TOGGLE_LABELS: Record<string, string> = {
  readyOnly: "Ready Only",
  blockedOnly: "Blocked Only",
  showArchived: "Show Archived",
}

function makeStatusOptions(filters: Filters): SelectOption[] {
  return VISIBLE_STATUSES.map((status) => ({
    name: `${filters.status === status ? "●" : "○"} ${STATUS_LABELS[status]}`,
    description: "",
    value: status,
  }))
}

function makePriorityOptions(filters: Filters): SelectOption[] {
  return PRIORITIES.map((priority) => ({
    name: `${filters.priority === priority ? "●" : "○"} ${PRIORITY_LABELS[priority]}`,
    description: "",
    value: priority,
  }))
}

function makeSourceOptions(filters: Filters): SelectOption[] {
  return SOURCES.map((source) => ({
    name: `${filters.source === source ? "●" : "○"} ${source}`,
    description: "",
    value: source,
  }))
}

function makeToggleOptions(filters: Filters): SelectOption[] {
  return TOGGLE_KEYS.map((key) => ({
    name: `${filters[key] ? "●" : "○"} ${TOGGLE_LABELS[key]}`,
    description: "",
    value: key,
  }))
}

export function FilterBar({
  filters,
  onToggleStatus,
  onTogglePriority,
  onToggleSource,
  onToggleReady,
  onToggleBlocked,
  onToggleArchived,
  onClear,
  onClose,
}: FilterBarProps) {
  const [sectionIdx, setSectionIdx] = useState(0)

  const currentSection = SECTIONS[sectionIdx]

  useActiveKeyboard((event: KeyEvent) => {
    const input = event.raw || ""

    if (event.name === "escape") {
      onClose()
      return
    }

    if (event.name === "tab" && !event.shift) {
      setSectionIdx((prev) => Math.min(SECTIONS.length - 1, prev + 1))
    } else if ((event.name === "tab" && event.shift) || event.name === "btab") {
      setSectionIdx((prev) => Math.max(0, prev - 1))
    } else if (input === "c") {
      onClear()
    } else if (currentSection === "actions" && (event.name === "return" || input === " ")) {
      onClear()
    }
  })

  const handleStatusSelect = (_index: number, option: SelectOption | null) => {
    if (option?.value) onToggleStatus(option.value as Status)
  }

  const handlePrioritySelect = (_index: number, option: SelectOption | null) => {
    if (option?.value) onTogglePriority(option.value as Priority)
  }

  const handleSourceSelect = (_index: number, option: SelectOption | null) => {
    if (option?.value) onToggleSource(option.value as Source)
  }

  const handleToggleSelect = (_index: number, option: SelectOption | null) => {
    if (!option?.value) return
    const key = option.value as (typeof TOGGLE_KEYS)[number]
    if (key === "readyOnly") onToggleReady()
    else if (key === "blockedOnly") onToggleBlocked()
    else if (key === "showArchived") onToggleArchived()
  }

  const selectHeight = 6

  return (
    <box flexDirection="column" backgroundColor={theme.bg_1} paddingX={2} paddingY={1}>
      <text attributes={TextAttributes.BOLD} fg={theme.fg_1}>⚙ Filters</text>

      {/* Status */}
      <box marginTop={1} flexDirection="column">
        <text attributes={TextAttributes.BOLD} fg={currentSection === "status" ? theme.blue : theme.fg_0}>
          Status:
        </text>
        <select
          options={makeStatusOptions(filters)}
          focused={currentSection === "status"}
          height={selectHeight}
          showDescription={false}
          onSelect={handleStatusSelect}
          textColor={theme.fg_0}
          selectedTextColor={theme.fg_1}
          selectedBackgroundColor={theme.bg_2}
          backgroundColor={theme.bg_1}
        />
      </box>

      {/* Priority */}
      <box marginTop={1} flexDirection="column">
        <text attributes={TextAttributes.BOLD} fg={currentSection === "priority" ? theme.blue : theme.fg_0}>
          Priority:
        </text>
        <select
          options={makePriorityOptions(filters)}
          focused={currentSection === "priority"}
          height={selectHeight}
          showDescription={false}
          onSelect={handlePrioritySelect}
          textColor={theme.fg_0}
          selectedTextColor={theme.fg_1}
          selectedBackgroundColor={theme.bg_2}
          backgroundColor={theme.bg_1}
        />
      </box>

      {/* Source */}
      <box marginTop={1} flexDirection="column">
        <text attributes={TextAttributes.BOLD} fg={currentSection === "source" ? theme.blue : theme.fg_0}>
          Source:
        </text>
        <select
          options={makeSourceOptions(filters)}
          focused={currentSection === "source"}
          height={selectHeight}
          showDescription={false}
          onSelect={handleSourceSelect}
          textColor={theme.fg_0}
          selectedTextColor={theme.fg_1}
          selectedBackgroundColor={theme.bg_2}
          backgroundColor={theme.bg_1}
        />
      </box>

      {/* Toggles */}
      <box marginTop={1} flexDirection="column">
        <text attributes={TextAttributes.BOLD} fg={currentSection === "toggles" ? theme.blue : theme.fg_0}>
          Toggles:
        </text>
        <select
          options={makeToggleOptions(filters)}
          focused={currentSection === "toggles"}
          height={4}
          showDescription={false}
          onSelect={handleToggleSelect}
          textColor={theme.fg_0}
          selectedTextColor={theme.fg_1}
          selectedBackgroundColor={theme.bg_2}
          backgroundColor={theme.bg_1}
        />
      </box>

      {/* Actions */}
      <box marginTop={1}>
        <text
          attributes={currentSection === "actions" ? TextAttributes.INVERSE : TextAttributes.NONE}
          fg={currentSection === "actions" ? theme.fg_1 : theme.fg_0}
        >
          Clear All Filters (c)
        </text>
      </box>

      {/* Help */}
      <box marginTop={1}>
        <text fg={theme.fg_0}>Tab/S-Tab section  ↑/↓ item  Enter toggle  c clear  Esc close</text>
      </box>
    </box>
  )
}
