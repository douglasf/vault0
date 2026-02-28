import type { ReactNode } from "react"
import { useTerminalDimensions } from "@opentui/react"
import { RGBA } from "@opentui/core"
import { theme, toRGBA } from "../lib/theme.js"
import { useKeybindScope } from "../hooks/useKeybindScope.js"
import { useKeybind } from "../hooks/useKeybind.js"
import { SCOPE_PRIORITY } from "../lib/keybind-registry.js"

/** Preset modal size names mapped to max column widths. */
type ModalSize = "small" | "medium" | "large"

const SIZE_WIDTHS: Record<ModalSize, number> = {
  small: 50,
  medium: 60,
  large: 80,
}

/** Semi-transparent black backdrop covering the full terminal. */
const BACKDROP_COLOR = RGBA.fromInts(0, 0, 0, 150)

/**
 * Base modal overlay used by all modal dialogs (StatusPicker, ConfirmDelete, etc.).
 *
 * Renders a centered, bordered dialog on top of a semi-transparent backdrop.
 * Pressing Escape triggers `onClose`. The dialog width is clamped to the
 * terminal width minus gutters.
 *
 * Supports an optional `title` rendered inside the border via the native
 * `<box title>` prop, so consumers don't need a separate title element.
 */
export interface ModalOverlayProps {
  children: ReactNode
  /** Called when the user presses Escape. */
  onClose?: () => void
  /** Explicit max width in columns — overrides `size`. */
  maxWidth?: number
  /** Preset size (default: "medium"). Ignored when `maxWidth` is set. */
  size?: ModalSize
  /** Optional title rendered in the modal border. */
  title?: string
  /** Alignment of the border title (default: "left"). */
  titleAlignment?: "left" | "center" | "right"
}

export function ModalOverlay({
  children,
  onClose,
  maxWidth,
  size = "medium",
  title,
  titleAlignment = "center",
}: ModalOverlayProps) {
  const { width, height } = useTerminalDimensions()
  const effectiveMaxWidth = maxWidth ?? SIZE_WIDTHS[size]
  const modalWidth = Math.min(effectiveMaxWidth, width - 4)
  const maxModalHeight = height - 4

  const scope = useKeybindScope("modal-overlay", {
    priority: SCOPE_PRIORITY.OVERLAY,
    opaque: true,
  })
  useKeybind(scope, "Escape", () => { if (onClose) onClose() }, {
    description: "Close modal",
    when: !!onClose,
  })

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width={width}
      height={height}
      alignItems="center"
      justifyContent="center"
      backgroundColor={BACKDROP_COLOR}
      zIndex={100}
    >
      <box
        backgroundColor={toRGBA(theme.bg_1)}
        padding={1}
        width={modalWidth}
        maxHeight={maxModalHeight}
        flexDirection="column"
        flexGrow={0}
      >
        {title ? <box minHeight={2}><text fg={theme.fg_1}>{title}</text></box> : ""}
        {children}
      </box>
    </box>
  )
}
