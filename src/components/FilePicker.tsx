import { useRef, useState, useMemo } from "react"
import type { KeyEvent, ScrollBoxRenderable, SelectOption } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"
import { getProjectFiles, searchFiles } from "../lib/file-search.js"
import { theme } from "../lib/theme.js"
import { ModalOverlay } from "./ModalOverlay.js"

export interface FilePickerProps {
  repoRoot: string
  onSelect: (filePath: string) => void
  onCancel: () => void
}

/**
 * Modal overlay for fuzzy-searching project files.
 *
 * Triggered when the user types @ in a textarea. Displays a filterable
 * list of project files and inserts the selected path on confirmation.
 */
export function FilePicker({ repoRoot, onSelect, onCancel }: FilePickerProps) {
  const [searchFilter, setSearchFilter] = useState("")
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const { height: terminalRows } = useTerminalDimensions()

  // Scan project files once (memoised on repoRoot)
  const allFiles = useMemo(() => getProjectFiles(repoRoot), [repoRoot])

  // Filter files by search query
  const matchedFiles = useMemo(
    () => searchFiles(allFiles, searchFilter, 50),
    [allFiles, searchFilter],
  )

  // Modal chrome: 4 (modal margin) + 2 (padding) + 1 (title) + 1 (search) + 2 (footer) = 10
  const chromeHeight = 10
  const contentHeight = matchedFiles.length === 0 ? 1 : Math.min(15, matchedFiles.length)
  const availableHeight = Math.max(3, terminalRows - chromeHeight)
  const scrollHeight = contentHeight > availableHeight ? availableHeight : contentHeight

  const selectOptions: SelectOption[] = matchedFiles.map((filePath) => ({
    name: filePath,
    description: "",
    value: filePath,
  }))

  // Reset scroll to top when search changes
  const prevFilter = useRef(searchFilter)
  if (prevFilter.current !== searchFilter) {
    prevFilter.current = searchFilter
    scrollRef.current?.scrollTo(0)
  }

  useActiveKeyboard((event: KeyEvent) => {
    if (event.name === "backspace" || event.name === "delete") {
      setSearchFilter((s) => s.slice(0, -1))
    } else if (
      event.raw &&
      event.raw.length === 1 &&
      !event.ctrl &&
      !event.meta &&
      /[a-zA-Z0-9 _\-./]/.test(event.raw)
    ) {
      setSearchFilter((s) => s + event.raw)
    }
  })

  return (
    <ModalOverlay size="large" title="Insert File Path (@)" onClose={onCancel}>
      <box>
        <text fg={theme.dim_0}>Search: </text>
        {searchFilter ? (
          <text>{searchFilter}</text>
        ) : (
          <text fg={theme.dim_0}>(type to filter)</text>
        )}
      </box>

      <scrollbox ref={scrollRef} scrollY focused={false} flexGrow={0} flexShrink={1} height={scrollHeight}>
        <box flexDirection="column">
          {matchedFiles.length === 0 ? (
            <text fg={theme.dim_0}>No matching files</text>
          ) : (
            <select
              options={selectOptions}
              focused={true}
              height={Math.min(15, selectOptions.length)}
              showDescription={false}
              showScrollIndicator={matchedFiles.length > 15}
              textColor={theme.dim_0}
              backgroundColor={theme.bg_1}
              selectedBackgroundColor={theme.cyan}
              selectedTextColor={theme.bg_1}
              onSelect={(_index: number, option: SelectOption | null) => {
                if (option?.value) {
                  onSelect(option.value)
                }
              }}
            />
          )}
        </box>
      </scrollbox>

      <box marginTop={1}>
        <text fg={theme.dim_0}>↑/↓: navigate  Enter: select  Esc: cancel  (type to filter)</text>
      </box>
    </ModalOverlay>
  )
}
