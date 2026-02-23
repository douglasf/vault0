import { useState, useMemo } from "react"
import type { KeyEvent } from "@opentui/core"
import { TextAttributes } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { Scrollbar } from "./Scrollbar.js"
import { theme } from "../lib/theme.js"
import { ModalOverlay } from "./ModalOverlay.js"

export interface HelpOverlayProps {
  onClose: () => void
}

interface ShortcutSection {
  title: string
  shortcuts: [string, string][]
}

// ── Legend data with actual theme color references ───────────────────

interface LegendEntry {
  label: string
  desc: string
  color: () => string
  bgColor?: () => string
}

interface LegendSection {
  title: string
  entries: LegendEntry[]
}

const legendSections: LegendSection[] = [
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
      { label: "→", desc: "Subtask — indented child task", color: () => theme.dim_0 },
      { label: "↳ Parent", desc: "Shows parent task", color: () => theme.dim_0 },
      { label: "⌫", desc: "Archived task", color: () => theme.dim_0 },
    ],
  },
]

const sections: ShortcutSection[] = [
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
      ["?", "Show / close this help"],
      ["q", "Quit application"],
      ["Ctrl+C", "Emergency exit"],
      ["Esc", "Return to board view"],
    ],
  },
]

/**
 * Flatten sections into renderable items for display.
 */
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

function buildItems(): RenderItem[] {
  const items: RenderItem[] = []

  items.push({ kind: "divider", label: "⌨  Keyboard Shortcuts" })
  for (const section of sections) {
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

const allItems = buildItems()

function filterItems(items: RenderItem[], query: string): RenderItem[] {
  if (!query) return items
  const lower = query.toLowerCase()
  const result: RenderItem[] = []
  let pendingHeader: (HeaderItem | DividerItem) | null = null

  for (const item of items) {
    if (item.kind === "header" || item.kind === "divider") {
      pendingHeader = item
    } else {
      const searchText = item.kind === "shortcut"
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

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  const { height: terminalRows } = useTerminalDimensions()

  const [filter, setFilter] = useState("")
  const [scrollOffset, setScrollOffset] = useState(0)

  const filteredItems = useMemo(() => filterItems(allItems, filter), [filter])

  // Available height for scrollable content inside the modal.
  // Modal has border (2) + padding (2) + title (1) + marginBottom (1) +
  // filter line (1) + marginTop (1) + footer (1) + marginTop (1) = ~10.
  // Plus the outer overlay centering eats some space.
  // Use ~60% of terminal height as content area.
  const contentHeight = Math.max(3, Math.floor(terminalRows * 0.6))

  const maxScroll = Math.max(0, filteredItems.length - 1)

  const visibleWindow = useMemo(() => {
    const offset = Math.min(scrollOffset, maxScroll)
    let linesUsed = 0
    let count = 0
    for (let i = offset; i < filteredItems.length; i++) {
      let itemLines = 1
      const k = filteredItems[i].kind
      if ((k === "header" || k === "divider") && i > offset) {
        itemLines += 1
      }
      if (linesUsed + itemLines > contentHeight && count > 0) break
      linesUsed += itemLines
      count++
    }
    return { offset, count, linesUsed }
  }, [scrollOffset, maxScroll, filteredItems, contentHeight])

  const visible = filteredItems.slice(visibleWindow.offset, visibleWindow.offset + visibleWindow.count)
  const needsScrollbar = filteredItems.length > visibleWindow.count || visibleWindow.offset > 0

  useKeyboard((event: KeyEvent) => {
    // Close overlay
    if ((event.raw === "?") || event.name === "escape") {
      onClose()
      return
    }

    // Scroll
    if (event.name === "up") {
      setScrollOffset((prev) => Math.max(0, prev - 1))
      return
    }
    if (event.name === "down") {
      setScrollOffset((prev) => Math.min(maxScroll, prev + 1))
      return
    }
    if (event.name === "pagedown") {
      setScrollOffset((prev) => Math.min(maxScroll, prev + contentHeight))
      return
    }
    if (event.name === "pageup") {
      setScrollOffset((prev) => Math.max(0, prev - contentHeight))
      return
    }

    // Backspace — remove last character from filter
    if (event.name === "backspace") {
      setFilter((prev) => prev.slice(0, -1))
      setScrollOffset(0)
      return
    }

    // Regular character input — append to filter
    const input = event.raw || ""
    if (input && input.length === 1 && !event.ctrl && !event.meta) {
      setFilter((prev) => prev + input)
      setScrollOffset(0)
      return
    }
  })

  const matchCount = filteredItems.filter((i) => i.kind === "shortcut" || i.kind === "legend").length
  const totalCount = allItems.filter((i) => i.kind === "shortcut" || i.kind === "legend").length
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
            {matchCount}/{totalCount} matches
          </text>
        )}
      </box>

      {/* Filter input */}
      <box>
        <text fg={theme.fg_0}>Filter: </text>
        <text fg={theme.fg_1}>{filter}</text>
        <text fg={theme.fg_1}>▎</text>
      </box>

      {/* Scrollable shortcut list */}
      <box flexDirection="row" flexGrow={1} marginTop={1} height={visibleWindow.linesUsed}>
        <box flexDirection="column" flexGrow={1}>
          {visible.length === 0 ? (
            <text fg={theme.fg_0} attributes={TextAttributes.ITALIC}>No matching shortcuts</text>
          ) : (
            visible.map((item, i) => {
              const k = `${item.kind}-${visibleWindow.offset + i}`
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
                  <box key={k}>
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
                <box key={k}>
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
        </box>
        {needsScrollbar && (
          <Scrollbar
            totalItems={filteredItems.length}
            visibleItems={visibleWindow.count}
            scrollOffset={visibleWindow.offset}
            trackHeight={visibleWindow.linesUsed}
            isActive
          />
        )}
      </box>

      {/* Footer */}
      <box marginTop={1}>
        <text fg={theme.fg_0}>
          Type to filter · ↑/↓ scroll · ? or Esc to close
        </text>
      </box>
    </ModalOverlay>
  )
}
