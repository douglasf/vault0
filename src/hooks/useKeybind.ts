import { useEffect, useRef } from "react"
import { ulid } from "ulidx"
import { useKeybindRegistry } from "../lib/keybind-context.js"
import type { KeyHandler } from "../lib/keybind-registry.js"

// ── Types ────────────────────────────────────────────────

export interface UseKeybindOptions {
  description?: string
  when?: boolean
}

// ── Hook ─────────────────────────────────────────────────

/**
 * Register a keybinding in a named scope.
 * Uses a handler ref to avoid re-registration when the callback changes.
 *
 * @param scopeName The scope to register in (from useKeybindScope)
 * @param key Key spec or array of key specs (aliases)
 * @param handler Callback invoked when key matches
 * @param options Description and conditional `when` flag
 */
export function useKeybind(
  scopeName: string,
  key: string | string[],
  handler: () => void,
  options?: UseKeybindOptions,
): void {
  const registry = useKeybindRegistry()
  const when = options?.when ?? true
  const description = options?.description

  // Stable handler ref — prevents re-registration on handler change
  const handlerRef = useRef<() => void>(handler)
  handlerRef.current = handler

  // Stable binding ID across renders
  const bindingIdRef = useRef<string>(ulid())

  // Stable key ref — avoid re-registration when array reference changes
  const keyRef = useRef(key)
  keyRef.current = key

  useEffect(() => {
    if (!when) return

    const stableHandler: KeyHandler = () => {
      handlerRef.current()
    }

    const bindingId = bindingIdRef.current
    const cleanup = registry.registerBinding(scopeName, {
      id: bindingId,
      key: keyRef.current,
      handler: stableHandler,
      description,
    })

    return cleanup
  }, [registry, scopeName, when, description])
}
