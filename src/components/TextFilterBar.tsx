import { useRef, useCallback } from "react"
import { TextAttributes } from "@opentui/core"
import type { KeyEvent } from "@opentui/core"
import type { InputRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { theme } from "../lib/theme.js"

export interface TextFilterBarProps {
  /** Current search value (so the input starts with existing filter text) */
  initialValue: string
  /** Called on every keystroke to update the live filter */
  onSearch: (term: string) => void
  /** Called when the user closes the text filter (Escape or Enter) */
  onClose: () => void
}

/**
 * Inline text search bar that appears above the board.
 * Captures all keyboard input while active.
 * - Type to filter tasks (live, filters as you type)
 * - Enter: close and keep the filter
 * - Escape: close and clear the filter
 */
export function TextFilterBar({ initialValue, onSearch, onClose }: TextFilterBarProps) {
  const inputRef = useRef<InputRenderable>(null)

  const handleInput = useCallback((value: string) => {
    onSearch(value)
  }, [onSearch])

  const handleSubmit = useCallback(() => {
    // Enter keeps the current search and closes
    onClose()
  }, [onClose])

  useKeyboard((event: KeyEvent) => {
    if (event.name === "escape") {
      // Escape clears the search and closes
      onSearch("")
      onClose()
      return
    }
  })

  return (
    <box paddingX={1} flexDirection="row">
      <text fg={theme.cyan} attributes={TextAttributes.BOLD}>🔍 </text>
      <input
        ref={inputRef}
        focused={true}
        value={initialValue}
        textColor={theme.cyan}
        onInput={handleInput}
        onSubmit={handleSubmit}
        flexGrow={1}
      />
      <text fg={theme.dim_0}>  Enter keep · Esc clear</text>
    </box>
  )
}
