import { memo, useRef, useImperativeHandle, forwardRef } from "react"
import type { InputRenderable } from "@opentui/core"
import { theme } from "../lib/theme.js"

export interface FormInputProps {
  label: string
  focused: boolean
  onFocus: () => void
  value?: string
  onInput?: (value: string) => void
  onSubmit?: () => void
  placeholder?: string
}

export interface FormInputHandle {
  /** Access the underlying input renderable (for reading .value) */
  input: InputRenderable | null
}

/**
 * Reusable bordered text input field used across form dialogs.
 *
 * Renders a single-border box with a title label and an inner `<input>`,
 * with focus-dependent border coloring.
 */
export const FormInput = memo(forwardRef<FormInputHandle, FormInputProps>(
  function FormInput({ label, focused, onFocus, value, onInput, onSubmit, placeholder }, ref) {
    const inputRef = useRef<InputRenderable>(null)

    useImperativeHandle(ref, () => ({
      get input() { return inputRef.current },
    }), [])

    return (
      <box
        border={true}
        borderStyle="single"
        borderColor={focused ? theme.blue : theme.fg_0}
        title={label}
        onMouseDown={onFocus}
      >
        <input
          ref={inputRef}
          focused={focused}
          value={value ?? ""}
          placeholder={placeholder}
          textColor={focused ? theme.fg_0 : theme.dim_0}
          focusedTextColor={theme.fg_1}
          paddingX={1}
          onInput={onInput}
          onSubmit={onSubmit}
          flexGrow={1}
        />
      </box>
    )
  },
))
