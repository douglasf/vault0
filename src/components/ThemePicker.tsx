import { useState, useCallback } from "react"
import type { KeyEvent } from "@opentui/core"
import { TextAttributes } from "@opentui/core"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"
import { theme, listThemes, setTheme, getActiveThemeName, getAppearance, toggleAppearance } from "../lib/theme.js"
import { ModalOverlay } from "./ModalOverlay.js"

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

  // Find initial index matching the active theme
  const initialIndex = Math.max(0, themes.findIndex((t) => t.name === originalTheme))
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)
  const [appearance, setAppearance] = useState(getAppearance)

  const handleCancel = useCallback(() => {
    // Restore original theme on cancel
    setTheme(originalTheme)
    if (getAppearance() !== originalAppearance) {
      toggleAppearance()
    }
    onCancel()
  }, [originalTheme, originalAppearance, onCancel])

  useActiveKeyboard((event: KeyEvent) => {
    if (event.name === "up") {
      setSelectedIndex((prev) => {
        const next = Math.max(0, prev - 1)
        setTheme(themes[next].name)
        onPreview?.()
        return next
      })
    } else if (event.name === "down") {
      setSelectedIndex((prev) => {
        const next = Math.min(themes.length - 1, prev + 1)
        setTheme(themes[next].name)
        onPreview?.()
        return next
      })
    } else if (event.name === "return") {
      onSelect(themes[selectedIndex].name, getAppearance())
    } else if (event.raw === "t") {
      const newAppearance = toggleAppearance()
      setAppearance(newAppearance)
      onPreview?.()
    }
  })

  return (
    <ModalOverlay onClose={handleCancel} size="medium" title="Select Theme">
      <box marginBottom={1}>
        <text fg={theme.fg_0}>
          {`Appearance: ${appearance}`}
        </text>
      </box>

      {themes.map((t, i) => {
        const isSelected = i === selectedIndex
        const isCurrent = i === selectedIndex
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
              {` (${t.source})${isCurrent ? " ✓" : ""}`}
            </text>
          </box>
        )
      })}

      <box marginTop={1}>
        <text fg={theme.dim_0}>↑/↓: navigate  t: toggle dark/light  Enter: select  Esc: cancel</text>
      </box>
    </ModalOverlay>
  )
}
