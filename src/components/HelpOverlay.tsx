import { useState, useMemo, useRef, useCallback } from "react"
import type { InputRenderable, KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"
import { theme } from "../lib/theme.js"
import { ModalOverlay } from "./ModalOverlay.js"

export interface HelpOverlayProps {
  onClose: () => void
}

// ── Data types ──────────────────────────────────────────────────────

interface ShortcutSection {
  title: string
  shortcuts: readonly [key: string, desc: string][]
}

interface LegendEntry {
  label: string
  desc: string
  /** Foreground color accessor (thunk to support runtime theme changes). */
  color: () => string
  /** Optional background color accessor. */
  bgColor?: () => string
}

interface LegendSection {
  title: string
  entries: LegendEntry[]
}

// ── Static data ─────────────────────────────────────────────────────

const legendSections: readonly LegendSection[] = [
  {
    title: "Priority Indicators",
    entries: [
      { label: "●", desc: "Critical", color: () => theme.red },
      { label: "●", desc: "High", color: () => theme.yellow },
      { label: "●", desc: "Normal", color: () => theme.fg_0 },
      { label: "●", desc: "Low", color: () => theme.dim_0 },
    ],
  },
  {
    title: "Task Type Badges",
    entries: [
      { label: "✦", desc: "Feature", color: () => theme.green },
      { label: "▪", desc: "Bug", color: () => theme.red },
      { label: "◇", desc: "Analysis", color: () => theme.cyan },
    ],
  },
  {
    title: "Status & Icons",
    entries: [
      { label: "🔒", desc: "Blocked — has unfinished dependencies", color: () => theme.red },
      { label: "◫ 2/5", desc: "Subtask progress (done/total)", color: () => theme.fg_0 },
      { label: "├/└", desc: "Subtask — tree connector (last uses └)", color: () => theme.dim_0 },
      { label: "↳ Parent", desc: "Shows parent task", color: () => theme.dim_0 },
      { label: "⌫", desc: "Archived task", color: () => theme.dim_0 },
    ],
  },
]

const shortcutSections: readonly ShortcutSection[] = [
  {
    title: "Board Navigation",
    shortcuts: [
      ["←/→", "Move between columns"],
      ["↑/↓", "Move between tasks within column"],
      ["</>", "Move task to previous/next lane"],
      ["Enter", "Open task detail view"],
      ["v", "Toggle task preview panel"],
    ],
  },
  {
    title: "Task Management",
    shortcuts: [
      ["a", "Create new task"],
      ["A (Shift+a)", "Create subtask under selected task"],
      ["s", "Change task status"],
      ["p", "Cycle task priority"],
      ["d", "Delete task (archive, or permanent if already archived)"],
      ["u", "Unarchive task (restore archived task)"],
      ["D (Shift+d)", "Archive all tasks in Done lane"],
      ["e", "Edit task"],
      ["c", "Copy task ID to clipboard"],
      ["h", "Toggle show/hide all subtasks"],
      ["S (Shift+s)", "Cycle sort order (priority → created → updated → title → priority)"],
    ],
  },
  {
    title: "Filtering & Search",
    shortcuts: [
      ["f", "Search tasks by title / description"],
      ["F (Shift+f)", "Open filter menu (status, priority, source)"],
      ["r", "Toggle 'ready tasks only' filter"],
      ["b", "Toggle 'blocked tasks only' filter"],
    ],
  },
  {
    title: "Dependencies (Detail View)",
    shortcuts: [
      ["+", "Add dependency"],
      ["-", "Remove dependency"],
    ],
  },
  {
    title: "General",
    shortcuts: [
      ["t", "Open theme picker (select theme + dark/light)"],
      ["?", "Show / close this help"],
      ["q", "Quit application"],
      ["Ctrl+C", "Emergency exit"],
      ["Esc", "Return to board view"],
    ],
  },
]

// ── Flattened render items ──────────────────────────────────────────

interface HeaderItem {
  kind: "header"
  title: string
}

interface ShortcutItem {
  kind: "shortcut"
  key: string
  desc: string
}

interface LegendItem {
  kind: "legend"
  entry: LegendEntry
}

interface DividerItem {
  kind: "divider"
  label: string
}

type RenderItem = HeaderItem | ShortcutItem | LegendItem | DividerItem

/** Flatten section data into a flat list of renderable items. */
function buildItems(): RenderItem[] {
  const items: RenderItem[] = []

  items.push({ kind: "divider", label: "⌨  Keyboard Shortcuts" })
  for (const section of shortcutSections) {
    items.push({ kind: "header", title: section.title })
    for (const [key, desc] of section.shortcuts) {
      items.push({ kind: "shortcut", key, desc })
    }
  }

  items.push({ kind: "divider", label: "🎨  Legend" })
  for (const section of legendSections) {
    items.push({ kind: "header", title: section.title })
    for (const entry of section.entries) {
      items.push({ kind: "legend", entry })
    }
  }
  return items
}

/** Pre-built list of all help items (static, computed once at module load). */
const allItems = buildItems()

/** Total number of content items (excluding headers/dividers). */
const totalContentCount = allItems.filter(
  (i) => i.kind === "shortcut" || i.kind === "legend",
).length

/**
 * Filter items by a search query, preserving section headers when they contain
 * at least one matching child item.
 */
function filterItems(items: readonly RenderItem[], query: string): RenderItem[] {
  if (!query) return items as RenderItem[]
  const lower = query.toLowerCase()
  const result: RenderItem[] = []
  let pendingHeader: HeaderItem | DividerItem | null = null

  for (const item of items) {
    if (item.kind === "header" || item.kind === "divider") {
      pendingHeader = item
    } else {
      const searchText =
        item.kind === "shortcut"
          ? `${item.key} ${item.desc}`
          : `${item.entry.label} ${item.entry.desc}`
      if (searchText.toLowerCase().includes(lower)) {
        if (pendingHeader) {
          result.push(pendingHeader)
          pendingHeader = null
        }
        result.push(item)
      }
    }
  }
  return result
}

/**
 * Generate a stable React key for a render item.
 * Uses item content rather than array index for stability across filter changes.
 */
function itemKey(item: RenderItem): string {
  switch (item.kind) {
    case "divider":
      return `div-${item.label}`
    case "header":
      return `hdr-${item.title}`
    case "shortcut":
      return `key-${item.key}`
    case "legend":
      return `leg-${item.entry.label}-${item.entry.desc}`
  }
}

// ── Component ───────────────────────────────────────────────────────

/**
 * Full-screen help overlay displaying keyboard shortcuts and a UI legend.
 *
 * Features:
 * - Native `<input>` for live filtering of shortcuts/legend entries
 * - `<scrollbox>` for scrollable content when the list exceeds viewport
 * - Section headers are preserved when they contain matching items
 * - `?` or `Esc` closes the overlay
 */
export function HelpOverlay({ onClose }: HelpOverlayProps) {
  const { height: terminalRows } = useTerminalDimensions()
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const inputRef = useRef<InputRenderable>(null)

  const [filter, setFilter] = useState("")

  const filteredItems = useMemo(() => filterItems(allItems, filter), [filter])

  // Use ~60% of terminal height as scrollable content area.
  const contentHeight = Math.max(3, Math.floor(terminalRows * 0.6))

  const resetScroll = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [])

  useActiveKeyboard((event: KeyEvent) => {
    // Close overlay on `?` toggle
    if (event.raw === "?") {
      onClose()
      return
    }

    // Scroll via ScrollBox ref
    if (event.name === "up") {
      scrollRef.current?.scrollBy(-1)
      return
    }
    if (event.name === "down") {
      scrollRef.current?.scrollBy(1)
      return
    }
    if (event.name === "pagedown") {
      scrollRef.current?.scrollBy(contentHeight)
      return
    }
    if (event.name === "pageup") {
      scrollRef.current?.scrollBy(-contentHeight)
      return
    }
  })

  const matchCount = filteredItems.filter(
    (i) => i.kind === "shortcut" || i.kind === "legend",
  ).length
  const isFiltered = filter.length > 0

  return (
    <ModalOverlay onClose={onClose} size="large">
      {/* Title bar */}
      <box justifyContent="space-between" marginBottom={1}>
        <text fg={theme.fg_1} attributes={TextAttributes.BOLD}>
          Vault0 — Help
        </text>
        {isFiltered && (
          <text fg={theme.fg_0}>
            {matchCount}/{totalContentCount} matches
          </text>
        )}
      </box>

      {/* Filter input */}
      <box flexDirection="row">
        <text fg={theme.fg_0}>Filter: </text>
        <input
          ref={inputRef}
          focused
          value={filter}
          placeholder="type to filter…"
          textColor={theme.fg_1}
          onInput={(value: string) => {
            setFilter(value)
            resetScroll()
          }}
        />
      </box>

      {/* Scrollable shortcut list */}
      <scrollbox ref={scrollRef} scrollY flexGrow={1} marginTop={1} height={contentHeight}>
        {filteredItems.length === 0 ? (
          <text fg={theme.fg_0} attributes={TextAttributes.ITALIC}>
            No matching shortcuts
          </text>
        ) : (
          filteredItems.map((item, i) => {
            const k = itemKey(item)
            if (item.kind === "divider") {
              return (
                <box key={k} marginTop={i === 0 ? 0 : 1} marginBottom={0}>
                  <text fg={theme.cyan} attributes={TextAttributes.BOLD}>
                    {item.label}
                  </text>
                </box>
              )
            }
            if (item.kind === "header") {
              return (
                <box key={k} marginTop={i === 0 ? 0 : 1}>
                  <text fg={theme.fg_1} attributes={TextAttributes.BOLD | TextAttributes.UNDERLINE}>
                    {item.title}
                  </text>
                </box>
              )
            }
            if (item.kind === "legend") {
              const { entry } = item
              return (
                <box key={k} flexDirection="row">
                  <box width={16}>
                    <text
                      fg={entry.color()}
                      bg={entry.bgColor?.()}
                      attributes={TextAttributes.BOLD}
                    >
                      {entry.label}
                    </text>
                  </box>
                  {entry.desc ? <text fg={theme.fg_0}>{entry.desc}</text> : null}
                </box>
              )
            }
            // shortcut
            return (
              <box key={k} flexDirection="row">
                <box width={16}>
                  <text fg={theme.fg_1} attributes={TextAttributes.BOLD}>
                    {item.key}
                  </text>
                </box>
                <text fg={theme.fg_0}>{item.desc}</text>
              </box>
            )
          })
        )}
      </scrollbox>

      {/* Footer */}
      <box marginTop={1}>
        <text fg={theme.fg_0}>
          Type to filter · ↑/↓ scroll · ? or Esc to close
        </text>
      </box>
    </ModalOverlay>
  )
}
