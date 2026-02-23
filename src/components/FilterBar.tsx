import { useState } from "react"
import { TextAttributes } from "@opentui/core"
import type { KeyEvent } from "@opentui/core"
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

// Define navigable sections and their items
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

function sectionItemCount(section: SectionKey): number {
  switch (section) {
    case "status": return VISIBLE_STATUSES.length
    case "priority": return PRIORITIES.length
    case "source": return SOURCES.length
    case "toggles": return TOGGLE_KEYS.length
    case "actions": return 1 // "Clear Filters"
  }
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
  const [itemIdx, setItemIdx] = useState(0)

  useActiveKeyboard((event: KeyEvent) => {
    const input = event.raw || ""

    if (event.name === "escape") {
      onClose()
      return
    }

    if (event.name === "up") {
      setSectionIdx((prev) => {
        const next = Math.max(0, prev - 1)
        setItemIdx(0)
        return next
      })
    } else if (event.name === "down") {
      setSectionIdx((prev) => {
        const next = Math.min(SECTIONS.length - 1, prev + 1)
        setItemIdx(0)
        return next
      })
    } else if (event.name === "left") {
      setItemIdx((prev) => Math.max(0, prev - 1))
    } else if (event.name === "right") {
      const max = sectionItemCount(SECTIONS[sectionIdx]) - 1
      setItemIdx((prev) => Math.min(max, prev + 1))
    } else if (event.name === "return" || input === " ") {
      const section = SECTIONS[sectionIdx]
      if (section === "status") {
        onToggleStatus(VISIBLE_STATUSES[itemIdx])
      } else if (section === "priority") {
        onTogglePriority(PRIORITIES[itemIdx])
      } else if (section === "source") {
        onToggleSource(SOURCES[itemIdx])
      } else if (section === "toggles") {
        const toggleKey = TOGGLE_KEYS[itemIdx]
        if (toggleKey === "readyOnly") onToggleReady()
        else if (toggleKey === "blockedOnly") onToggleBlocked()
        else if (toggleKey === "showArchived") onToggleArchived()
      } else if (section === "actions") {
        onClear()
      }
    } else if (input === "c") {
      onClear()
    }
  })

  const currentSection = SECTIONS[sectionIdx]

  return (
    <box flexDirection="column" backgroundColor={theme.bg_1} paddingX={2} paddingY={1}>
      <text attributes={TextAttributes.BOLD} fg={theme.fg_1}>⚙ Filters</text>

      {/* Status */}
      <box marginTop={1} flexDirection="column">
        <text attributes={TextAttributes.BOLD} fg={currentSection === "status" ? theme.blue : theme.fg_0}>
          Status:
        </text>
        <box gap={1}>
          {VISIBLE_STATUSES.map((status, idx) => {
            const isSelected = filters.status === status
            const isCursor = currentSection === "status" && itemIdx === idx
            const attrs = (isCursor ? TextAttributes.INVERSE : TextAttributes.NONE) | (isSelected ? TextAttributes.BOLD : TextAttributes.NONE)
            return (
              <box key={status}>
                <text
                  fg={getStatusColor(status)}
                  attributes={attrs}
                >
                  {isSelected ? "●" : "○"} {STATUS_LABELS[status]}
                </text>
              </box>
            )
          })}
        </box>
      </box>

      {/* Priority */}
      <box marginTop={1} flexDirection="column">
        <text attributes={TextAttributes.BOLD} fg={currentSection === "priority" ? theme.blue : theme.fg_0}>
          Priority:
        </text>
        <box gap={1}>
          {PRIORITIES.map((priority, idx) => {
            const isSelected = filters.priority === priority
            const isCursor = currentSection === "priority" && itemIdx === idx
            const attrs = (isCursor ? TextAttributes.INVERSE : TextAttributes.NONE) | (isSelected ? TextAttributes.BOLD : TextAttributes.NONE)
            return (
              <box key={priority}>
                <text attributes={attrs} fg={theme.fg_0}>
                  {isSelected ? "●" : "○"} {PRIORITY_LABELS[priority]}
                </text>
              </box>
            )
          })}
        </box>
      </box>

      {/* Source */}
      <box marginTop={1} flexDirection="column">
        <text attributes={TextAttributes.BOLD} fg={currentSection === "source" ? theme.blue : theme.fg_0}>
          Source:
        </text>
        <box gap={1}>
          {SOURCES.map((source, idx) => {
            const isSelected = filters.source === source
            const isCursor = currentSection === "source" && itemIdx === idx
            const attrs = (isCursor ? TextAttributes.INVERSE : TextAttributes.NONE) | (isSelected ? TextAttributes.BOLD : TextAttributes.NONE)
            return (
              <box key={source}>
                <text attributes={attrs} fg={theme.fg_0}>
                  {isSelected ? "●" : "○"} {source}
                </text>
              </box>
            )
          })}
        </box>
      </box>

      {/* Toggle Filters */}
      <box marginTop={1} flexDirection="column">
        <text attributes={TextAttributes.BOLD} fg={currentSection === "toggles" ? theme.blue : theme.fg_0}>
          Toggles:
        </text>
        <box gap={1}>
          {TOGGLE_KEYS.map((toggleKey, idx) => {
            const isSelected = !!filters[toggleKey]
            const isCursor = currentSection === "toggles" && itemIdx === idx
            const attrs = (isCursor ? TextAttributes.INVERSE : TextAttributes.NONE) | (isSelected ? TextAttributes.BOLD : TextAttributes.NONE)
            return (
              <box key={toggleKey}>
                <text attributes={attrs} fg={theme.fg_0}>
                  {isSelected ? "●" : "○"} {TOGGLE_LABELS[toggleKey]}
                </text>
              </box>
            )
          })}
        </box>
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
        <text fg={theme.fg_0}>↑/↓ section  ←/→ item  Enter toggle  c clear  Esc close</text>
      </box>
    </box>
  )
}
