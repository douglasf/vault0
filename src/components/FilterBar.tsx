import { useCallback, useRef, useState } from "react"
import { TextAttributes } from "@opentui/core"
import type { KeyEvent, ScrollBoxRenderable, SelectOption } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { Filters, Status, Priority, Source } from "../lib/types.js"
import { VISIBLE_STATUSES, PRIORITY_ORDER, STATUS_LABELS, PRIORITY_LABELS } from "../lib/constants.js"
import { theme } from "../lib/theme.js"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"
import { ModalOverlay } from "./ModalOverlay.js"

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
const SPACE_SELECT_BINDING = [{ name: "space", action: "select-current" as const }]

const SECTION_HEIGHTS = [
  1 + VISIBLE_STATUSES.length + 1,  // status
  1 + PRIORITIES.length + 1,         // priority
  1 + SOURCES.length + 1,            // source
  1 + TOGGLE_KEYS.length + 1,        // toggles
  1,                                  // actions
]

const TOGGLE_LABELS: Record<string, string> = {
  readyOnly: "Ready Only",
  blockedOnly: "Blocked Only",
  showArchived: "Show Archived",
}

function makeStatusOptions(filters: Filters): SelectOption[] {
  return VISIBLE_STATUSES.map((status) => ({
    name: `${filters.statuses?.includes(status) ? "●" : "○"} ${STATUS_LABELS[status]}`,
    description: "",
    value: status,
  }))
}

function makePriorityOptions(filters: Filters): SelectOption[] {
  return PRIORITIES.map((priority) => ({
    name: `${filters.priorities?.includes(priority) ? "●" : "○"} ${PRIORITY_LABELS[priority]}`,
    description: "",
    value: priority,
  }))
}

function makeSourceOptions(filters: Filters): SelectOption[] {
  return SOURCES.map((source) => ({
    name: `${filters.sources?.includes(source) ? "●" : "○"} ${source}`,
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
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const { height: terminalRows } = useTerminalDimensions()

  // Modal chrome: 4 (modal margin) + 2 (padding) + 1 (title) = 7
  // Help text outside scrollbox: 1 (help text) + 1 (marginBottom) = 2
  const chromeHeight = 7 + 2
  const contentHeight = SECTION_HEIGHTS.reduce((sum, h) => sum + h, 0)
  const availableHeight = Math.max(5, terminalRows - chromeHeight)
  const needsScroll = contentHeight > availableHeight
  const scrollHeight = needsScroll ? availableHeight : contentHeight

  const currentSection = SECTIONS[sectionIdx]

  // ── Auto-scroll to keep focused section visible ────────────────────────
  const scrollToSection = useCallback(
    (idx: number) => {
      if (!scrollRef.current) return
      let sectionTop = 0
      for (let i = 0; i < idx; i++) sectionTop += SECTION_HEIGHTS[i]
      const sectionBottom = sectionTop + SECTION_HEIGHTS[idx]
      const currentScroll = scrollRef.current.scrollTop
      if (sectionTop < currentScroll) {
        scrollRef.current.scrollTo(sectionTop)
      } else if (sectionBottom > currentScroll + scrollHeight) {
        scrollRef.current.scrollTo(sectionBottom - scrollHeight)
      }
    },
    [scrollHeight],
  )

  // Scroll when section changes
  scrollToSection(sectionIdx)

  useActiveKeyboard((event: KeyEvent) => {
    const input = event.raw || ""

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

  return (
    <ModalOverlay onClose={onClose} size="medium" title=" ⚙ Filters ">
      <text fg={theme.dim_0} marginBottom={1}>
        Tab/S-Tab section · ↑/↓ item · Enter/Space toggle · c clear · Esc close
      </text>

      <scrollbox ref={scrollRef} scrollY focused={false} flexGrow={0} flexShrink={1} height={scrollHeight}>
        {/* Status */}
      <box flexDirection="column" marginBottom={1} flexShrink={0}>
        <text attributes={TextAttributes.BOLD} fg={currentSection === "status" ? theme.blue : theme.fg_0}>
          Status:
        </text>
        <select
          options={makeStatusOptions(filters)}
          focused={currentSection === "status"}
          height={VISIBLE_STATUSES.length}
          showDescription={false}
          onSelect={handleStatusSelect}
          keyBindings={SPACE_SELECT_BINDING}
          textColor={theme.fg_0}
          selectedTextColor={theme.fg_1}
          selectedBackgroundColor={theme.bg_2}
          backgroundColor={theme.bg_1}
        />
      </box>

      {/* Priority */}
      <box flexDirection="column" marginBottom={1} flexShrink={0}>
        <text attributes={TextAttributes.BOLD} fg={currentSection === "priority" ? theme.blue : theme.fg_0}>
          Priority:
        </text>
        <select
          options={makePriorityOptions(filters)}
          focused={currentSection === "priority"}
          height={PRIORITIES.length}
          showDescription={false}
          onSelect={handlePrioritySelect}
          keyBindings={SPACE_SELECT_BINDING}
          textColor={theme.fg_0}
          selectedTextColor={theme.fg_1}
          selectedBackgroundColor={theme.bg_2}
          backgroundColor={theme.bg_1}
        />
      </box>

      {/* Source */}
      <box flexDirection="column" marginBottom={1} flexShrink={0}>
        <text attributes={TextAttributes.BOLD} fg={currentSection === "source" ? theme.blue : theme.fg_0}>
          Source:
        </text>
        <select
          options={makeSourceOptions(filters)}
          focused={currentSection === "source"}
          height={SOURCES.length}
          showDescription={false}
          onSelect={handleSourceSelect}
          keyBindings={SPACE_SELECT_BINDING}
          textColor={theme.fg_0}
          selectedTextColor={theme.fg_1}
          selectedBackgroundColor={theme.bg_2}
          backgroundColor={theme.bg_1}
        />
      </box>

      {/* Toggles */}
      <box flexDirection="column" marginBottom={1} flexShrink={0}>
        <text attributes={TextAttributes.BOLD} fg={currentSection === "toggles" ? theme.blue : theme.fg_0}>
          Toggles:
        </text>
        <select
          options={makeToggleOptions(filters)}
          focused={currentSection === "toggles"}
          height={TOGGLE_KEYS.length}
          showDescription={false}
          onSelect={handleToggleSelect}
          keyBindings={SPACE_SELECT_BINDING}
          textColor={theme.fg_0}
          selectedTextColor={theme.fg_1}
          selectedBackgroundColor={theme.bg_2}
          backgroundColor={theme.bg_1}
        />
      </box>

      {/* Actions */}
      <box>
        <text
          attributes={currentSection === "actions" ? TextAttributes.INVERSE : TextAttributes.NONE}
          fg={currentSection === "actions" ? theme.fg_1 : theme.fg_0}
        >
          Clear All Filters (c)
        </text>
      </box>
      </scrollbox>
    </ModalOverlay>
  )
}
