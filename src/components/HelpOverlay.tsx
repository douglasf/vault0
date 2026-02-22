import React, { useState, useMemo } from "react"
import { Box, Text, useInput, useStdout } from "ink"
import { Scrollbar } from "./Scrollbar.js"
import { theme } from "../lib/theme.js"

export interface HelpOverlayProps {
  onClose: () => void
}

interface ShortcutSection {
  title: string
  shortcuts: [string, string][]
}

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
      ["D (Shift+d)", "Archive all tasks in Done lane"],
      ["e", "Edit task"],
      ["c", "Copy task ID to clipboard"],
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
 * Each item is either a section header or a shortcut row.
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
type RenderItem = HeaderItem | ShortcutItem

function buildItems(): RenderItem[] {
  const items: RenderItem[] = []
  for (const section of sections) {
    items.push({ kind: "header", title: section.title })
    for (const [key, desc] of section.shortcuts) {
      items.push({ kind: "shortcut", key, desc })
    }
  }
  return items
}

const allItems = buildItems()

/**
 * Filter the flat item list by a search string. Matches against both the key
 * binding and its description (case-insensitive). Section headers are included
 * only when at least one shortcut in the section matches.
 */
function filterItems(items: RenderItem[], query: string): RenderItem[] {
  if (!query) return items
  const lower = query.toLowerCase()
  const result: RenderItem[] = []
  let pendingHeader: HeaderItem | null = null

  for (const item of items) {
    if (item.kind === "header") {
      pendingHeader = item
    } else {
      if (item.desc.toLowerCase().includes(lower) || item.key.toLowerCase().includes(lower)) {
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
  const { stdout } = useStdout()
  const terminalRows = stdout?.rows || 24

  const [filter, setFilter] = useState("")
  const [scrollOffset, setScrollOffset] = useState(0)

  const filteredItems = useMemo(() => filterItems(allItems, filter), [filter])

  // Available height for the scrollable content area.
  // Subtract chrome: App header (~3), overlay paddingY (2),
  // title line + marginBottom (2), filter line (1),
  // footer + marginTop (2). Total overhead ≈ 10 lines.
  const contentHeight = Math.max(3, terminalRows - 10)

  // Clamp scroll offset to valid range
  const maxScroll = Math.max(0, filteredItems.length - 1)

  // Find the scroll offset that ensures the content fits. We scroll by item
  // index and compute how many items fit in the content area starting at offset.
  const visibleWindow = useMemo(() => {
    const offset = Math.min(scrollOffset, maxScroll)
    let linesUsed = 0
    let count = 0
    for (let i = offset; i < filteredItems.length; i++) {
      let itemLines = 1
      // Section headers (not at the top of the window) have a margin line above
      if (filteredItems[i].kind === "header" && i > offset) {
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

  useInput((input, key) => {
    // Close overlay
    if (input === "?" || key.escape) {
      onClose()
      return
    }

    // Scroll
    if (key.upArrow) {
      setScrollOffset((prev) => Math.max(0, prev - 1))
      return
    }
    if (key.downArrow) {
      setScrollOffset((prev) => Math.min(maxScroll, prev + 1))
      return
    }
    if (key.pageDown) {
      setScrollOffset((prev) => Math.min(maxScroll, prev + contentHeight))
      return
    }
    if (key.pageUp) {
      setScrollOffset((prev) => Math.max(0, prev - contentHeight))
      return
    }

    // Backspace — remove last character from filter
    if (key.backspace || key.delete) {
      setFilter((prev) => prev.slice(0, -1))
      setScrollOffset(0)
      return
    }

    // Regular character input — append to filter
    if (input && !key.ctrl && !key.meta) {
      setFilter((prev) => prev + input)
      setScrollOffset(0)
      return
    }
  })

  const matchCount = filteredItems.filter((i) => i.kind === "shortcut").length
  const totalCount = allItems.filter((i) => i.kind === "shortcut").length
  const isFiltered = filter.length > 0

  return (
    <Box
      flexDirection="column"
      width="100%"
      backgroundColor={theme.ui.panelBgCyan}
      paddingX={2}
      paddingY={1}
      flexGrow={1}
    >
      {/* Title bar */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={theme.ui.accent}>
          Vault0 — Keyboard Shortcuts
        </Text>
        {isFiltered && (
          <Text dimColor>
            {matchCount}/{totalCount} matches
          </Text>
        )}
      </Box>

      {/* Filter input */}
      <Box>
        <Text dimColor>Filter: </Text>
        <Text color={theme.ui.accent}>{filter}</Text>
        <Text color={theme.ui.accent}>▎</Text>
      </Box>

      {/* Scrollable shortcut list */}
      <Box flexDirection="row" flexGrow={1} marginTop={1}>
        <Box flexDirection="column" flexGrow={1}>
          {visible.length === 0 ? (
            <Text dimColor italic>No matching shortcuts</Text>
          ) : (
            visible.map((item, i) => {
              if (item.kind === "header") {
                return (
                  <Box key={`h-${visibleWindow.offset + i}`} marginTop={i === 0 ? 0 : 1}>
                    <Text bold underline color={theme.ui.accentWarm}>
                      {item.title}
                    </Text>
                  </Box>
                )
              }
              return (
                <Box key={`s-${visibleWindow.offset + i}`}>
                  <Box width={16}>
                    <Text bold color={theme.ui.success}>
                      {item.key}
                    </Text>
                  </Box>
                  <Text>{item.desc}</Text>
                </Box>
              )
            })
          )}
        </Box>
        {needsScrollbar && (
          <Scrollbar
            totalItems={filteredItems.length}
            visibleItems={visibleWindow.count}
            scrollOffset={visibleWindow.offset}
            trackHeight={visibleWindow.linesUsed}
            isActive
          />
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          Type to filter · ↑/↓ scroll · ? or Esc to close
        </Text>
      </Box>
    </Box>
  )
}
