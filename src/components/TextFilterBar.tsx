import { useCallback } from "react"
import { TextAttributes } from "@opentui/core"
import { theme } from "../lib/theme.js"
import { useKeybindScope } from "../hooks/useKeybindScope.js"
import { useKeybind } from "../hooks/useKeybind.js"
import { SCOPE_PRIORITY } from "../lib/keybind-registry.js"

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
 *
 * Captures all keyboard input while active:
 * - Type to filter tasks (live, filters as you type)
 * - Enter: close and keep the filter
 * - Escape: close and clear the filter
 */
export function TextFilterBar({ initialValue, onSearch, onClose }: TextFilterBarProps) {
  const handleEscapeClear = useCallback(() => {
    onSearch("")
    onClose()
  }, [onSearch, onClose])

  const scope = useKeybindScope("text-filter", {
    priority: SCOPE_PRIORITY.OVERLAY,
    opaque: true,
  })

  useKeybind(scope, "Escape", handleEscapeClear, { description: "Clear and close filter" })

  return (
    <box paddingX={1} flexDirection="row">
      <text fg={theme.cyan} attributes={TextAttributes.BOLD}>🔍 </text>
      <input
        focused={true}
        value={initialValue}
        textColor={theme.cyan}
        onInput={onSearch}
        onSubmit={onClose}
        flexGrow={1}
      />
      <text fg={theme.dim_0}>  Enter keep · Esc clear</text>
    </box>
  )
}
