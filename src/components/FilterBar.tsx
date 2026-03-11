import { useCallback, useMemo, useRef, useState } from "react"
import { TextAttributes } from "@opentui/core"
import type { InputRenderable, ScrollBoxRenderable, SelectOption } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { Filters, Status, Priority, Source } from "../lib/types.js"
import { VISIBLE_STATUSES, PRIORITY_ORDER, STATUS_LABELS, PRIORITY_LABELS } from "../lib/constants.js"
import { theme } from "../lib/theme.js"
import { useKeybindScope } from "../hooks/useKeybindScope.js"
import { useKeybind } from "../hooks/useKeybind.js"
import { SCOPE_PRIORITY } from "../lib/keybind-registry.js"
import { ModalOverlay } from "./ModalOverlay.js"

export interface FilterBarProps {
  filters: Filters
  onToggleStatus: (status: Status) => void
  onTogglePriority: (priority: Priority) => void
  onToggleSource: (source: Source) => void
  onToggleTag: (tag: string) => void
  onToggleReady: () => void
  onToggleBlocked: () => void
  onToggleArchived: () => void
  onClear: () => void
  onClose: () => void
  availableTags: string[]
}

type SectionKey = "status" | "priority" | "source" | "tags" | "tags-chips" | "toggles" | "actions"

const PRIORITIES = Object.keys(PRIORITY_ORDER) as Priority[]
const SOURCES: Source[] = ["manual", "opencode", "opencode-plan", "todo_md", "import"]
const TOGGLE_KEYS = ["readyOnly", "blockedOnly", "showArchived"] as const
const SPACE_SELECT_BINDING = [{ name: "space", action: "select-current" as const }]

const STATUS_HEIGHT = 1 + VISIBLE_STATUSES.length + 1
const PRIORITY_HEIGHT = 1 + PRIORITIES.length + 1
const SOURCE_HEIGHT = 1 + SOURCES.length + 1
const TOGGLES_HEIGHT = 1 + TOGGLE_KEYS.length + 1
const ACTIONS_HEIGHT = 1

/** Tags input section: label(1) + input(1) + suggestions (up to 5) + margin(1) */
function getTagsInputHeight(suggestionCount: number): number {
  return 1 + 1 + Math.min(suggestionCount, 5) + 1
}

/** Tags chips section: chips row(1) + margin(1) */
const TAGS_CHIPS_HEIGHT = 1 + 1

function buildSections(hasChips: boolean): SectionKey[] {
  const sections: SectionKey[] = ["status", "priority", "source", "tags"]
  if (hasChips) sections.push("tags-chips")
  sections.push("toggles", "actions")
  return sections
}

function getSectionHeights(sections: SectionKey[], tagSuggestionCount: number): number[] {
  return sections.map((s) => {
    switch (s) {
      case "status": return STATUS_HEIGHT
      case "priority": return PRIORITY_HEIGHT
      case "source": return SOURCE_HEIGHT
      case "tags": return getTagsInputHeight(tagSuggestionCount)
      case "tags-chips": return TAGS_CHIPS_HEIGHT
      case "toggles": return TOGGLES_HEIGHT
      case "actions": return ACTIONS_HEIGHT
    }
  })
}

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

/** Simple fuzzy match: all characters of query appear in order in target */
function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

export function FilterBar({
  filters,
  onToggleStatus,
  onTogglePriority,
  onToggleSource,
  onToggleTag,
  onToggleReady,
  onToggleBlocked,
  onToggleArchived,
  onClear,
  onClose,
  availableTags,
}: FilterBarProps) {
  const [sectionIdx, setSectionIdx] = useState(0)
  const [tagInput, setTagInput] = useState("")
  const [focusedTagIndex, setFocusedTagIndex] = useState(0)
  const tagInputRef = useRef<InputRenderable>(null)
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const { height: terminalRows } = useTerminalDimensions()

  const selectedTags = filters.tags ?? []
  const hasChips = selectedTags.length > 0
  const sections = useMemo(() => buildSections(hasChips), [hasChips])
  const clampedIdx = Math.min(sectionIdx, sections.length - 1)
  const currentSection = sections[clampedIdx]
  const chipMode = currentSection === "tags-chips"

  // Fuzzy-match available tags against input, excluding already-selected ones
  const tagSuggestions = useMemo(() => {
    const unselected = availableTags.filter((t) => !selectedTags.includes(t))
    if (!tagInput) return unselected.slice(0, 5)
    return unselected.filter((t) => fuzzyMatch(tagInput, t)).slice(0, 5)
  }, [availableTags, selectedTags, tagInput])

  // Modal chrome: 4 (modal margin) + 2 (padding) + 1 (title) = 7
  // Help text outside scrollbox: 1 (help text) + 1 (marginBottom) = 2
  const chromeHeight = 7 + 2
  const sectionHeights = getSectionHeights(sections, tagSuggestions.length)
  const contentHeight = sectionHeights.reduce((sum: number, h: number) => sum + h, 0)
  const availableHeight = Math.max(5, terminalRows - chromeHeight)
  const needsScroll = contentHeight > availableHeight
  const scrollHeight = needsScroll ? availableHeight : contentHeight

  // ── Auto-scroll to keep focused section visible ────────────────────────
  const scrollToSection = useCallback(
    (idx: number) => {
      if (!scrollRef.current) return
      let sectionTop = 0
      for (let i = 0; i < idx; i++) sectionTop += sectionHeights[i]
      const sectionBottom = sectionTop + sectionHeights[idx]
      const currentScroll = scrollRef.current.scrollTop
      if (sectionTop < currentScroll) {
        scrollRef.current.scrollTo(sectionTop)
      } else if (sectionBottom > currentScroll + scrollHeight) {
        scrollRef.current.scrollTo(sectionBottom - scrollHeight)
      }
    },
    [scrollHeight, sectionHeights],
  )

  // Scroll when section changes
  scrollToSection(sectionIdx)

  const handleTagInputSubmit = useCallback(() => {
    if (!tagInput) return
    const match = tagSuggestions[0]
    if (match) {
      onToggleTag(match)
      setTagInput("")
      if (tagInputRef.current) tagInputRef.current.value = ""
    }
  }, [tagInput, tagSuggestions, onToggleTag])

  const handleTagInputChange = useCallback((value: string) => {
    setTagInput(value)
  }, [])

  const handleTagBackspace = useCallback(() => {
    if (tagInput === "" && selectedTags.length > 0) {
      onToggleTag(selectedTags[selectedTags.length - 1])
    }
  }, [tagInput, selectedTags, onToggleTag])

  const scope = useKeybindScope("filter-bar", {
    priority: SCOPE_PRIORITY.WIDGET,
    opaque: false,
  })
  useKeybind(scope, "Tab", useCallback(() => {
    setSectionIdx((prev) => Math.min(sections.length - 1, prev + 1))
  }, [sections.length]), { description: "Next section" })
  useKeybind(scope, "Shift+Tab", useCallback(() => {
    setSectionIdx((prev) => Math.max(0, prev - 1))
  }, []), { description: "Previous section" })
  useKeybind(scope, "c", onClear, { description: "Clear all filters" })
  useKeybind(scope, "Backspace", handleTagBackspace, {
    description: "Remove last tag",
    when: currentSection === "tags" && !chipMode && tagInput === "",
  })
  useKeybind(scope, "Right", useCallback(() => {
    setFocusedTagIndex((prev) => Math.min(prev + 1, selectedTags.length - 1))
  }, [selectedTags.length]), {
    description: "Next tag chip",
    when: chipMode,
  })
  useKeybind(scope, "Left", useCallback(() => {
    setFocusedTagIndex((prev) => Math.max(prev - 1, 0))
  }, []), {
    description: "Previous tag chip",
    when: chipMode,
  })
  useKeybind(scope, "Delete", useCallback(() => {
    const tag = selectedTags[focusedTagIndex]
    if (!tag) return
    onToggleTag(tag)
    // Adjust focus after removal
    if (selectedTags.length <= 1) {
      // No tags left after removal → chips section will disappear, move back to tags input
      setSectionIdx((prev) => Math.max(0, prev - 1))
      setFocusedTagIndex(0)
    } else if (focusedTagIndex >= selectedTags.length - 1) {
      // Was on last tag → move to new last
      setFocusedTagIndex(selectedTags.length - 2)
    }
    // Otherwise keep same index (next tag slides into position)
  }, [focusedTagIndex, selectedTags, onToggleTag]), {
    description: "Remove focused tag",
    when: chipMode,
  })
  useKeybind(scope, ["Enter", "Space"], useCallback(() => {
    if (currentSection === "actions") onClear()
  }, [currentSection, onClear]), {
    description: "Activate action",
    when: currentSection === "actions",
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
        Tab/S-Tab section · ↑/↓ item · Enter/Space toggle · ←/→ chip nav · Del remove chip · c clear · Esc close
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

      {/* Tags Input */}
      <box flexDirection="column" marginBottom={1} flexShrink={0}>
        <text attributes={TextAttributes.BOLD} fg={currentSection === "tags" ? theme.blue : theme.fg_0}>
          Tags:
        </text>
        <box height={1}>
          <input
            ref={tagInputRef}
            focused={currentSection === "tags"}
            value=""
            placeholder="Type to search tags…"
            textColor={theme.fg_0}
            focusedTextColor={theme.fg_1}
            onInput={handleTagInputChange}
            onSubmit={handleTagInputSubmit}
            flexGrow={1}
          />
        </box>
        {currentSection === "tags" && tagSuggestions.length > 0 && (
          <box flexDirection="column">
            {tagSuggestions.map((tag) => (
              <text
                key={tag}
                fg={selectedTags.includes(tag) ? theme.cyan : theme.dim_0}
                onMouseDown={() => { onToggleTag(tag); setTagInput(""); if (tagInputRef.current) tagInputRef.current.value = "" }}
              >  {tag}</text>
            ))}
          </box>
        )}
      </box>

      {/* Tag Chips (only when tags are selected) */}
      {selectedTags.length > 0 && (
        <box flexDirection="column" marginBottom={1} flexShrink={0}>
          <box flexDirection="row" flexWrap="wrap" columnGap={1}>
            {selectedTags.map((tag, idx) => (
              <text
                key={tag}
                fg={chipMode && focusedTagIndex === idx ? theme.bg_1 : theme.cyan}
                bg={chipMode && focusedTagIndex === idx ? theme.cyan : theme.bg_2}
                attributes={chipMode && focusedTagIndex === idx ? TextAttributes.BOLD : TextAttributes.NONE}
                onMouseDown={() => onToggleTag(tag)}
              > {tag} ✕ </text>
            ))}
          </box>
        </box>
      )}

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
