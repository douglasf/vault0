import type { ReactNode } from "react"
import { useTerminalDimensions } from "@opentui/react"
import { RGBA } from "@opentui/core"
import { theme, toRGBA } from "../lib/theme.js"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"
import type { KeyEvent } from "@opentui/core"

export interface ModalOverlayProps {
  children: ReactNode
  onClose?: () => void
  maxWidth?: number
  size?: "small" | "medium" | "large"
}

const SIZE_WIDTHS: Record<string, number> = {
  small: 50,
  medium: 60,
  large: 80,
}

export function ModalOverlay({ children, onClose, maxWidth, size = "medium" }: ModalOverlayProps) {
  const { width, height } = useTerminalDimensions()
  const effectiveMaxWidth = maxWidth ?? SIZE_WIDTHS[size] ?? 60

  useActiveKeyboard((event: KeyEvent) => {
    if (event.name === "escape" && onClose) {
      onClose()
    }
  }, true)

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width={width}
      height={height}
      alignItems="center"
      justifyContent="center"
      backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
      zIndex={100}
    >
      <box
        backgroundColor={toRGBA(theme.bg_1)}
        border={true}
        borderStyle="rounded"
        borderColor={theme.dim_0}
        padding={1}
        width={Math.min(effectiveMaxWidth, width - 4)}
        flexDirection="column"
      >
        {children}
      </box>
    </box>
  )
}
