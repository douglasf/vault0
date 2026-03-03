import { memo } from "react"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { theme } from "../lib/theme.js"
import { truncateText } from "../lib/format.js"
import { useToast } from "../lib/toast-context.js"
import type { ToastType } from "../lib/toast-context.js"

// ── Styling ─────────────────────────────────────────────────────────

/** Icon and color per toast type */
function getToastStyle(type: ToastType): { icon: string; fg: string; borderColor: string } {
  switch (type) {
    case "success": return { icon: "✓", fg: theme.green, borderColor: theme.green }
    case "error":   return { icon: "✖", fg: theme.red, borderColor: theme.red }
    case "info":    return { icon: "●", fg: theme.cyan, borderColor: theme.cyan }
  }
}

/** Max width of a toast (characters) */
const MAX_TOAST_WIDTH = 50

/** Max width for the text content (accounting for border + padding + icon) */
const MAX_TEXT_WIDTH = MAX_TOAST_WIDTH - 6

// ── Component ───────────────────────────────────────────────────────

/**
 * Renders toast notifications at the top-right of the terminal.
 *
 * Toasts are positioned absolutely so they overlay the board content.
 * Multiple toasts stack vertically. Each toast auto-dismisses after
 * its duration, or can be dismissed with Escape (handled by the parent).
 */
export const Toast = memo(function Toast() {
  const { toasts } = useToast()
  const { width: termWidth } = useTerminalDimensions()

  if (toasts.length === 0) return null

  return (
    <box
      position="absolute"
      top={0}
      left={Math.max(0, termWidth - MAX_TOAST_WIDTH - 2)}
      width={MAX_TOAST_WIDTH + 2}
      flexDirection="column"
      zIndex={100}
    >
      {toasts.map((toast) => {
        const style = getToastStyle(toast.type)
        return (
          <box
            key={toast.id}
            border={true}
            borderStyle="single"
            borderColor={style.borderColor}
            backgroundColor={theme.bg_0}
            paddingX={1}
            marginBottom={0}
            width={MAX_TOAST_WIDTH}
            flexDirection="column"
          >
            <box flexDirection="row">
              <text fg={style.fg} attributes={TextAttributes.BOLD}>
                {style.icon}{" "}
              </text>
              <text fg={theme.fg_0} attributes={TextAttributes.BOLD}>{toast.header}</text>
            </box>
            <text fg={theme.fg_1}>{truncateText(toast.text, MAX_TEXT_WIDTH)}</text>
          </box>
        )
      })}
    </box>
  )
})
