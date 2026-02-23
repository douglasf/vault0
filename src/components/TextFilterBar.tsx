import { useEffect, useRef } from "react"
import { TextAttributes } from "@opentui/core"
import type { KeyEvent } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { useTextInput } from "../hooks/useTextInput.js"
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
  const textInput = useTextInput(initialValue, false)
  const prevValueRef = useRef(initialValue)

  // Sync text input value to the filter whenever it changes
  useEffect(() => {
    if (textInput.value !== prevValueRef.current) {
      prevValueRef.current = textInput.value
      onSearch(textInput.value)
    }
  }, [textInput.value, onSearch])

  useKeyboard((event: KeyEvent) => {
    if (event.name === "escape") {
      // Escape clears the search and closes
      onSearch("")
      onClose()
      return
    }
    if (event.name === "return") {
      // Enter keeps the current search and closes
      onClose()
      return
    }
    textInput.handleKeyEvent(event)
  })

  return (
    <box paddingX={1}>
      <text fg={theme.cyan} attributes={TextAttributes.BOLD}>🔍 </text>
      <text fg={theme.cyan}>
        {textInput.beforeCursor}
        <text attributes={TextAttributes.INVERSE}>{textInput.afterCursor[0] || " "}</text>
        {textInput.afterCursor.slice(1)}
      </text>
      <text fg={theme.dim_0}>  Enter keep · Esc clear</text>
    </box>
  )
}
