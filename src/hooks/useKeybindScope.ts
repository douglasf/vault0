import { useEffect } from "react"
import { useKeybindRegistry } from "../lib/keybind-context.js"
import { SCOPE_PRIORITY } from "../lib/keybind-registry.js"

// ── Types ────────────────────────────────────────────────

export interface UseKeybindScopeOptions {
  priority?: number
  opaque?: boolean
  active?: boolean
}

// ── Hook ─────────────────────────────────────────────────

/**
 * Register a keybinding scope with the registry.
 * The scope is registered on mount and unregistered on unmount.
 * When `active` is false, the scope is deactivated (removed from dispatch
 * stack) but its bindings are preserved so they survive the toggle cycle.
 *
 * @param name Unique scope name (shared if same name used from multiple components)
 * @param options Priority, opaque, and active flags
 * @returns The scope name for passing to useKeybind
 */
export function useKeybindScope(
  name: string,
  options?: UseKeybindScopeOptions,
): string {
  const registry = useKeybindRegistry()
  const priority = options?.priority ?? SCOPE_PRIORITY.VIEW
  const opaque = options?.opaque ?? false
  const active = options?.active ?? true

  // Activate / deactivate the scope when active changes.
  // deactivateScope preserves bindings so they survive the cycle.
  useEffect(() => {
    if (active) {
      registry.registerScope(name, priority, opaque)
    } else {
      registry.deactivateScope(name)
    }
  }, [registry, name, priority, opaque, active])

  // Full cleanup only on unmount — removes scope and all its bindings.
  useEffect(() => {
    return () => registry.unregisterScope(name)
  }, [registry, name])

  return name
}
