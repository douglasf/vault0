import type React from "react"
import { theme } from "../lib/theme.js"

export interface ScrollbarProps {
  /** Total number of items in the scrollable list */
  totalItems: number
  /** Number of items visible in the current window */
  visibleItems: number
  /** Current scroll offset (first visible item index) */
  scrollOffset: number
  /** Height of the scrollbar track in terminal lines */
  trackHeight: number
  /** Whether this scrollbar's parent container is focused */
  isActive?: boolean
}

export function Scrollbar({
  totalItems,
  visibleItems,
  scrollOffset,
  trackHeight,
  isActive = false,
}: ScrollbarProps) {
  // Don't render if all content fits
  if (totalItems <= visibleItems || trackHeight <= 0) return null

  // Calculate thumb size (proportional to visible/total ratio, minimum 1)
  const thumbSize = Math.max(1, Math.round((visibleItems / totalItems) * trackHeight))

  // Calculate thumb position (proportional to scroll progress)
  const maxOffset = totalItems - visibleItems
  const scrollRatio = maxOffset > 0 ? scrollOffset / maxOffset : 0
  const thumbStart = Math.round(scrollRatio * (trackHeight - thumbSize))

  const thumbColor = isActive ? theme.fg_1 : theme.fg_0
  const trackColor = theme.bg_2

  const lines: React.ReactNode[] = []
  for (let i = 0; i < trackHeight; i++) {
    const isThumb = i >= thumbStart && i < thumbStart + thumbSize
    lines.push(
      <text key={i} fg={isThumb ? thumbColor : trackColor}>
        {isThumb ? "█" : "│"}
      </text>,
    )
  }

  return (
    <box flexDirection="column" marginLeft={1}>
      {lines}
    </box>
  )
}
