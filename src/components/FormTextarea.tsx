import type { TextareaRenderable } from "@opentui/core"
import { forwardRef } from "react"
import { theme } from "../lib/theme.js"

export interface FormTextareaProps {
  placeholder?: string
  initialValue?: string
  focused?: boolean
  height?: number
  onMouseDown?: () => void
  // Allow spreading other textarea props
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export const FormTextarea = forwardRef<TextareaRenderable, FormTextareaProps>(
  function FormTextarea({ placeholder, initialValue, focused, height = 8, onMouseDown, ...props }, ref) {
    return (
      <box
        backgroundColor={theme.bg_0}
        height={height}
        marginBottom={1}
      >
        <textarea
          ref={ref}
          placeholder={placeholder}
          initialValue={initialValue}
          focused={focused}
          textColor={theme.dim_0}
          focusedTextColor={theme.fg_1}
          wrapMode="word"
          height={height}
          flexGrow={1}
          onMouseDown={onMouseDown}
          {...props}
        />
      </box>
    )
  }
)
