import { useState, useCallback, useRef } from "react"

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

  // Keep a ref to the latest fields array so advance/retreat are stable
  // and always see the current field list without depending on array identity.
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields

  const advance = useCallback(() => {
    setFocusField((prev) => {
      const f = fieldsRef.current
      const idx = f.indexOf(prev)
      return idx < f.length - 1 ? f[idx + 1] : prev
    })
  }, [])

  const retreat = useCallback(() => {
    setFocusField((prev) => {
      const f = fieldsRef.current
      const idx = f.indexOf(prev)
      return idx > 0 ? f[idx - 1] : prev
    })
  }, [])

  const isFocused = useCallback((field: F) => focusField === field, [focusField])

  return { focusField, setFocusField, advance, retreat, isFocused }
}
