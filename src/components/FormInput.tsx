import type { InputRenderable } from "@opentui/core"
import { forwardRef } from "react"
import { theme } from "../lib/theme.js"

export interface FormInputProps {
  placeholder?: string
  value?: string
  initialValue?: string
  focused?: boolean
  onMouseDown?: () => void
  onSubmit?: () => void
  [key: string]: any
}

export const FormInput = forwardRef<InputRenderable, FormInputProps>(
  function FormInput({ placeholder, value, focused, onMouseDown, onSubmit, ...props }, ref) {
    return (
      <box
        backgroundColor={theme.bg_0}
        height={1}
        marginBottom={1}
      >
        <input
          ref={ref}
          placeholder={placeholder}
          value={value}
          focused={focused}
          textColor={theme.dim_0}
          focusedTextColor={theme.fg_1}
          onMouseDown={onMouseDown}
          onSubmit={onSubmit}
          flexGrow={1}
          {...props}
        />
      </box>
    )
  }
)
