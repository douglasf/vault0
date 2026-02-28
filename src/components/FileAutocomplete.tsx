import { useMemo, useState, useCallback, useRef, useImperativeHandle, forwardRef } from "react"
import type { KeyEvent } from "@opentui/core"
import { getProjectFiles, searchFiles } from "../lib/file-search.js"
import { theme } from "../lib/theme.js"

/** Max suggestions to display */
const MAX_VISIBLE = 8

/** Handle exposed to parent for driving keyboard navigation */
export interface FileAutocompleteHandle {
  /** Handle a key event. Returns true if the event was consumed. */
  handleKey: (event: KeyEvent) => boolean
}

export interface FileAutocompleteProps {
  repoRoot: string
  /** Whether autocomplete is currently active/visible */
  isActive: boolean
  /** Current search query (text after @) */
  query: string
  /** Called when user selects a file path */
  onSelect: (filePath: string) => void
  /** Called when user presses Escape */
  onCancel: () => void
}

/**
 * Inline autocomplete popup for file paths.
 *
 * Pure visual overlay — does NOT capture focus or keyboard input.
 * The parent component drives navigation via the imperative handle.
 */
export const FileAutocomplete = forwardRef<FileAutocompleteHandle, FileAutocompleteProps>(
  function FileAutocomplete({ repoRoot, isActive, query, onSelect, onCancel }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Scan project files once (memoised on repoRoot)
  const allFiles = useMemo(() => getProjectFiles(repoRoot), [repoRoot])

  // Filter files by search query
  const matchedFiles = useMemo(
    () => searchFiles(allFiles, query, MAX_VISIBLE),
    [allFiles, query],
  )

  // Reset selection when query changes
  const prevQuery = useRef(query)
  if (prevQuery.current !== query) {
    prevQuery.current = query
    if (selectedIndex !== 0) setSelectedIndex(0)
  }

  const handleSelect = useCallback(() => {
    if (matchedFiles.length > 0 && selectedIndex < matchedFiles.length) {
      onSelect(matchedFiles[selectedIndex])
    }
  }, [matchedFiles, selectedIndex, onSelect])

  // Expose imperative handle for parent to drive keyboard navigation
  useImperativeHandle(ref, () => ({
    handleKey(event: KeyEvent): boolean {
      if (event.name === "escape") {
        onCancel()
        return true
      }
      if (event.name === "return" || event.name === "tab") {
        handleSelect()
        return true
      }
      if (event.name === "up") {
        setSelectedIndex((i) => (i > 0 ? i - 1 : matchedFiles.length - 1))
        return true
      }
      if (event.name === "down") {
        setSelectedIndex((i) => (i < matchedFiles.length - 1 ? i + 1 : 0))
        return true
      }
      return false
    },
  }), [onCancel, handleSelect, matchedFiles.length])

  if (matchedFiles.length === 0) {
    return (
      <box
        height={1}
        backgroundColor={theme.bg_1}
        paddingX={1}
      >
        <text fg={theme.dim_0}>No matching files</text>
      </box>
    )
  }

  return (
    <box
      flexDirection="column"
      backgroundColor={theme.bg_1}
      borderStyle="single"
      borderColor={theme.dim_0}
      paddingX={1}
      flexGrow={0}
      flexShrink={0}
      height={matchedFiles.length + 2}
    >
      {matchedFiles.map((filePath, i) => (
        <text
          key={filePath}
          fg={i === selectedIndex ? theme.bg_1 : theme.fg_0}
          bg={i === selectedIndex ? theme.cyan : undefined}
          onMouseDown={() => onSelect(filePath)}
        >
          {filePath}
        </text>
      ))}
    </box>
  )
})
