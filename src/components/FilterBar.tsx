import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import type { Filters, Status, Priority, Source } from "../lib/types.js"
import { VISIBLE_STATUSES, PRIORITY_ORDER, STATUS_LABELS, PRIORITY_LABELS } from "../lib/constants.js"
import { getStatusColor } from "../lib/theme.js"

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

  useInput((input, key) => {
    if (key.escape) {
      onClose()
      return
    }

    if (key.upArrow) {
      setSectionIdx((prev) => {
        const next = Math.max(0, prev - 1)
        setItemIdx(0)
        return next
      })
    } else if (key.downArrow) {
      setSectionIdx((prev) => {
        const next = Math.min(SECTIONS.length - 1, prev + 1)
        setItemIdx(0)
        return next
      })
    } else if (key.leftArrow) {
      setItemIdx((prev) => Math.max(0, prev - 1))
    } else if (key.rightArrow) {
      const max = sectionItemCount(SECTIONS[sectionIdx]) - 1
      setItemIdx((prev) => Math.min(max, prev + 1))
    } else if (key.return || input === " ") {
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
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Text bold color="cyan">⚙ Filters</Text>

      {/* Status */}
      <Box marginTop={1} flexDirection="column">
        <Text bold underline={currentSection === "status"} color={currentSection === "status" ? "cyan" : undefined}>
          Status:
        </Text>
        <Box gap={1}>
          {VISIBLE_STATUSES.map((status, idx) => {
            const isSelected = filters.status === status
            const isCursor = currentSection === "status" && itemIdx === idx
            return (
              <Box key={status}>
                <Text
                  color={getStatusColor(status)}
                  inverse={isCursor}
                  bold={isSelected}
                >
                  {isSelected ? "●" : "○"} {STATUS_LABELS[status]}
                </Text>
              </Box>
            )
          })}
        </Box>
      </Box>

      {/* Priority */}
      <Box marginTop={1} flexDirection="column">
        <Text bold underline={currentSection === "priority"} color={currentSection === "priority" ? "cyan" : undefined}>
          Priority:
        </Text>
        <Box gap={1}>
          {PRIORITIES.map((priority, idx) => {
            const isSelected = filters.priority === priority
            const isCursor = currentSection === "priority" && itemIdx === idx
            return (
              <Box key={priority}>
                <Text inverse={isCursor} bold={isSelected}>
                  {isSelected ? "●" : "○"} {PRIORITY_LABELS[priority]}
                </Text>
              </Box>
            )
          })}
        </Box>
      </Box>

      {/* Source */}
      <Box marginTop={1} flexDirection="column">
        <Text bold underline={currentSection === "source"} color={currentSection === "source" ? "cyan" : undefined}>
          Source:
        </Text>
        <Box gap={1}>
          {SOURCES.map((source, idx) => {
            const isSelected = filters.source === source
            const isCursor = currentSection === "source" && itemIdx === idx
            return (
              <Box key={source}>
                <Text inverse={isCursor} bold={isSelected}>
                  {isSelected ? "●" : "○"} {source}
                </Text>
              </Box>
            )
          })}
        </Box>
      </Box>

      {/* Toggle Filters */}
      <Box marginTop={1} flexDirection="column">
        <Text bold underline={currentSection === "toggles"} color={currentSection === "toggles" ? "cyan" : undefined}>
          Toggles:
        </Text>
        <Box gap={1}>
          {TOGGLE_KEYS.map((toggleKey, idx) => {
            const isSelected = !!filters[toggleKey]
            const isCursor = currentSection === "toggles" && itemIdx === idx
            return (
              <Box key={toggleKey}>
                <Text inverse={isCursor} bold={isSelected}>
                  {isSelected ? "●" : "○"} {TOGGLE_LABELS[toggleKey]}
                </Text>
              </Box>
            )
          })}
        </Box>
      </Box>

      {/* Actions */}
      <Box marginTop={1}>
        <Text
          inverse={currentSection === "actions"}
          color={currentSection === "actions" ? "cyan" : "gray"}
        >
          Clear All Filters (c)
        </Text>
      </Box>

      {/* Help */}
      <Box marginTop={1}>
        <Text dimColor>↑/↓ section  ←/→ item  Enter toggle  c clear  Esc close</Text>
      </Box>
    </Box>
  )
}
