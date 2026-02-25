import { useState, useCallback } from "react"

export interface UseFormNavigationResult<F extends string> {
  focusField: F
  setFocusField: (field: F) => void
  advance: () => void
  retreat: () => void
  isFocused: (field: F) => boolean
}

/**
 * Generic form field navigation hook.
 *
 * Manages focus state across an ordered list of form fields with
 * advance/retreat helpers for Tab/Shift+Tab navigation.
 *
 * @param fields  Ordered list of field identifiers
 * @param initial The initially focused field
 */
export function useFormNavigation<F extends string>(fields: F[], initial: F): UseFormNavigationResult<F> {
  const [focusField, setFocusField] = useState<F>(initial)

  const advance = useCallback(() => {
    const idx = fields.indexOf(focusField)
    if (idx < fields.length - 1) {
      setFocusField(fields[idx + 1])
    }
  }, [focusField, fields])

  const retreat = useCallback(() => {
    const idx = fields.indexOf(focusField)
    if (idx > 0) {
      setFocusField(fields[idx - 1])
    }
  }, [focusField, fields])

  const isFocused = useCallback((field: F) => focusField === field, [focusField])

  return { focusField, setFocusField, advance, retreat, isFocused }
}
