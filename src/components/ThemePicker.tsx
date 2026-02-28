import { useState, useCallback, useRef, useEffect } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useKeybindScope } from "../hooks/useKeybindScope.js"
import { useKeybind } from "../hooks/useKeybind.js"
import { SCOPE_PRIORITY } from "../lib/keybind-registry.js"
import { theme, listThemes, setTheme, getActiveThemeName, getAppearance, toggleAppearance } from "../lib/theme.js"
import { ModalOverlay } from "./ModalOverlay.js"

// ── Constants ────────────────────────────────────────────────────────────────

/** Rows reserved for modal chrome + header + footer outside the scrollbox. */
const CHROME_OVERHEAD = 11
/** Each theme row is exactly 1 line tall. */
const ROW_HEIGHT = 1
/** Minimum scrollbox height so it never collapses. */
const MIN_SCROLL_HEIGHT = 3
/** Context rows to keep visible above/below selected item. */
const SCROLL_BUFFER = 2

export interface ThemePickerProps {
  onSelect: (themeName: string, appearance: "dark" | "light") => void
  onCancel: () => void
  onPreview?: () => void
}

/**
 * Theme picker dialog — lists all available theme families and provides
 * live preview as the user navigates through the list. Pressing Enter
 * confirms the selection; Escape cancels and restores the original theme.
 */
export function ThemePicker({ onSelect, onCancel, onPreview }: ThemePickerProps) {
  const themes = listThemes()
  const originalTheme = getActiveThemeName()
  const originalAppearance = getAppearance()
  const { height: termHeight } = useTerminalDimensions()

  // Find initial index matching the active theme
  const initialIndex = Math.max(0, themes.findIndex((t) => t.name === originalTheme))
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)
  const [appearance, setAppearance] = useState(getAppearance)
  const scrollRef = useRef<ScrollBoxRenderable>(null)

  const contentHeight = themes.length * ROW_HEIGHT
  const availableHeight = Math.max(MIN_SCROLL_HEIGHT, termHeight - CHROME_OVERHEAD)
  const needsScroll = contentHeight > availableHeight
  const scrollHeight = needsScroll ? availableHeight : contentHeight

  // Disable native focus on the scrollbox — we drive scrolling programmatically
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.focusable = false
    }
  }, [])

  // ── Auto-scroll to keep selected theme visible ───────────────────────
  useEffect(() => {
    if (!scrollRef.current || themes.length === 0) return

    const sb = scrollRef.current
    const rowTop = selectedIndex * ROW_HEIGHT
    const rowBottom = rowTop + ROW_HEIGHT
    const viewportH = scrollHeight
    const totalH = themes.length * ROW_HEIGHT
    const currentScroll = sb.scrollTop

    if (rowTop - SCROLL_BUFFER < currentScroll) {
      sb.scrollTo(Math.max(0, rowTop - SCROLL_BUFFER))
    } else if (rowBottom + SCROLL_BUFFER > currentScroll + viewportH) {
      sb.scrollTo(Math.min(totalH - viewportH, rowBottom + SCROLL_BUFFER - viewportH))
    }
  }, [selectedIndex, scrollHeight, themes.length])

  const handleCancel = useCallback(() => {
    // Restore original theme on cancel
    setTheme(originalTheme)
    if (getAppearance() !== originalAppearance) {
      toggleAppearance()
    }
    onCancel()
  }, [originalTheme, originalAppearance, onCancel])

  const scope = useKeybindScope("theme-picker", {
    priority: SCOPE_PRIORITY.WIDGET,
    opaque: false,
  })
  useKeybind(scope, "ArrowUp", useCallback(() => {
    setSelectedIndex((prev) => {
      const next = Math.max(0, prev - 1)
      setTheme(themes[next].name)
      onPreview?.()
      return next
    })
  }, [themes, onPreview]), { description: "Previous theme" })
  useKeybind(scope, "ArrowDown", useCallback(() => {
    setSelectedIndex((prev) => {
      const next = Math.min(themes.length - 1, prev + 1)
      setTheme(themes[next].name)
      onPreview?.()
      return next
    })
  }, [themes, onPreview]), { description: "Next theme" })
  useKeybind(scope, "Enter", useCallback(() => {
    onSelect(themes[selectedIndex].name, getAppearance())
  }, [themes, selectedIndex, onSelect]), { description: "Select theme" })
  useKeybind(scope, "t", useCallback(() => {
    const newAppearance = toggleAppearance()
    setAppearance(newAppearance)
    onPreview?.()
  }, [onPreview]), { description: "Toggle dark/light" })

  return (
    <ModalOverlay onClose={handleCancel} size="medium" title="Select Theme">
      <box marginBottom={1}>
        <text fg={theme.fg_0}>
          {`Appearance: ${appearance}`}
        </text>
      </box>

      <scrollbox ref={scrollRef} scrollY focused={false} flexGrow={0} flexShrink={1} height={scrollHeight}>
        {themes.map((t, i) => {
          const isSelected = i === selectedIndex
          return (
            <box
              key={t.name}
              flexDirection="row"
              backgroundColor={isSelected ? theme.cyan : undefined}
            >
              <text
                fg={isSelected ? theme.bg_0 : theme.fg_1}
                attributes={isSelected ? TextAttributes.BOLD : 0}
              >
                {`${isSelected ? "▸ " : "  "}${t.name}`}
              </text>
              <text fg={isSelected ? theme.bg_1 : theme.dim_0}>
                {` (${t.source})${isSelected ? " ✓" : ""}`}
              </text>
            </box>
          )
        })}
      </scrollbox>

      <box marginTop={1}>
        <text fg={theme.dim_0}>↑/↓: navigate  t: toggle dark/light  Enter: select  Esc: cancel</text>
      </box>
    </ModalOverlay>
  )
}
