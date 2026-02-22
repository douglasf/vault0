import React, { useEffect, useRef } from "react"
import { Box, Text, useInput } from "ink"
import { useTextInput } from "../hooks/useTextInput.js"

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

  useInput((input, key) => {
    if (key.escape) {
      // Escape clears the search and closes
      onSearch("")
      onClose()
      return
    }
    if (key.return) {
      // Enter keeps the current search and closes
      onClose()
      return
    }
    textInput.handleInput(input, key)
  })

  return (
    <Box paddingX={1}>
      <Text color="#2aa198" bold>🔍 </Text>
      <Text color="#2aa198">
        {textInput.beforeCursor}
        <Text inverse>{textInput.afterCursor[0] || " "}</Text>
        {textInput.afterCursor.slice(1)}
      </Text>
      <Text dimColor>  Enter keep · Esc clear</Text>
    </Box>
  )
}
