import { useRef } from "react"
import { useKeyboard } from "@opentui/react"
import type { KeyEvent } from "@opentui/core"

/**
 * Drop-in replacement for Ink's `useInput(handler, { isActive })`.
 *
 * OpenTUI's `useKeyboard` has no `isActive` option, so we use a ref guard
 * to skip the handler when the hook is inactive. The ref avoids hook
 * dependency issues since React hooks cannot be called conditionally.
 */
export function useActiveKeyboard(
  handler: (event: KeyEvent) => void,
  isActive = true,
): void {
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useKeyboard((event: KeyEvent) => {
    if (!isActiveRef.current) return
    handlerRef.current(event)
  })
}
