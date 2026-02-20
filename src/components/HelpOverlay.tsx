import React, { useState } from "react"
import { Box, Text, useInput } from "ink"

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
      ["Enter", "Open task detail view"],
    ],
  },
  {
    title: "Task Management",
    shortcuts: [
      ["a", "Create new task"],
      ["A (Shift+a)", "Create subtask under selected task"],
      ["s", "Change task status"],
      ["p", "Cycle task priority"],
      ["d", "Archive (soft-delete) task"],
      ["e", "Edit task"],
    ],
  },
  {
    title: "Filtering & Search",
    shortcuts: [
      ["f", "Open filter menu"],
      ["r", "Toggle 'ready tasks only' filter"],
      ["b", "Toggle 'blocked tasks only' filter"],
      ["/", "Quick search by title (future)"],
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

const ITEMS_PER_PAGE = 14

/**
 * Flatten sections into renderable items so we can paginate cleanly.
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
const totalPages = Math.max(1, Math.ceil(allItems.length / ITEMS_PER_PAGE))

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  const [page, setPage] = useState(0)

  useInput((input, key) => {
    if (input === "?" || key.escape) {
      onClose()
    } else if (key.pageDown || input === "j") {
      setPage((p) => Math.min(totalPages - 1, p + 1))
    } else if (key.pageUp || input === "k") {
      setPage((p) => Math.max(0, p - 1))
    }
  })

  const start = page * ITEMS_PER_PAGE
  const end = Math.min(start + ITEMS_PER_PAGE, allItems.length)
  const visible = allItems.slice(start, end)

  return (
    <Box
      flexDirection="column"
      width="100%"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      flexGrow={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">
          Vault0 — Keyboard Shortcuts
        </Text>
        <Text dimColor>
          Page {page + 1}/{totalPages}
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {visible.map((item, i) => {
          if (item.kind === "header") {
            return (
              <Box key={`h-${start + i}`} marginTop={i === 0 ? 0 : 1}>
                <Text bold underline color="yellow">
                  {item.title}
                </Text>
              </Box>
            )
          }
          return (
            <Box key={`s-${start + i}`}>
              <Box width={16}>
                <Text bold color="green">
                  {item.key}
                </Text>
              </Box>
              <Text>{item.desc}</Text>
            </Box>
          )
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          j/PgDn next page · k/PgUp prev page · ? or Esc to close
        </Text>
      </Box>
    </Box>
  )
}
