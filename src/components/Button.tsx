import { memo } from "react"
import { TextAttributes } from "@opentui/core"
import { useKeybindScope } from "../hooks/useKeybindScope.js"
import { useKeybind } from "../hooks/useKeybind.js"
import { SCOPE_PRIORITY } from "../lib/keybind-registry.js"
import { theme } from "../lib/theme.js"

export interface ButtonProps {
  label: string
  onPress: () => void
  /** Key that triggers onPress when pressed (e.g. "y", "n", "enter") */
  hotkey?: string
  fg?: string
  bg?: string
}

/**
 * Reusable button component for dialogs and other interactive surfaces.
 *
 * Supports both mouse (onMouseDown) and keyboard (hotkey) activation.
 * The keyboard binding is automatically cleaned up when the component unmounts,
 * so dialogs that contain buttons won't leak key handlers after closing.
 */
export const Button = memo(function Button({ label, onPress, hotkey, fg, bg }: ButtonProps) {
  const scope = useKeybindScope("button-widget", {
    priority: SCOPE_PRIORITY.WIDGET,
  })
  useKeybind(scope, hotkey ?? "", onPress, {
    when: !!hotkey,
    description: `Button: ${label}`,
  })

  const buttonFg = fg ?? theme.fg_1
  const buttonBg = bg ?? theme.bg_2

  return (
    <box
      onMouseDown={onPress}
      backgroundColor={buttonBg}
      paddingX={3}
      paddingY={1}
    >
      <text fg={buttonFg} attributes={TextAttributes.BOLD}>
        {hotkey ? `[${hotkey}] ${label}` : label}
      </text>
    </box>
  )
})
