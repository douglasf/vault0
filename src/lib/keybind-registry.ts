import type { KeyEvent } from "@opentui/core"

// ── Types ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
export type KeyHandler = (event: KeyEvent) => void | boolean
export type KeyMatch = string

export interface KeyBinding {
  key: KeyMatch | KeyMatch[]
  handler: KeyHandler
  description?: string
  id: string
}

export interface Scope {
  name: string
  priority: number
  opaque: boolean
  active: boolean
  bindings: Map<string, KeyBinding>
}

// ── Scope priority constants ─────────────────────────────

export const SCOPE_PRIORITY = {
  ROOT: 0,
  VIEW: 10,
  OVERLAY: 20,
  WIDGET: 30,
} as const

// ── Named keys (matched against event.name) ─────────────

const NAMED_KEYS = new Set([
  "return", "escape", "tab", "backspace", "delete",
  "up", "down", "left", "right",
  "home", "end", "pageup", "pagedown",
  "f1", "f2", "f3", "f4", "f5", "f6",
  "f7", "f8", "f9", "f10", "f11", "f12",
  "space", "insert",
])

/**
 * Map from user-facing key names to the event.name values used by OpenTUI.
 * This lets task descriptions use "Enter" while internally we match "return".
 */
const KEY_ALIASES: Record<string, string> = {
  "Enter": "return",
  "Escape": "escape",
  "Tab": "tab",
  "Backspace": "backspace",
  "Delete": "delete",
  "ArrowUp": "up",
  "ArrowDown": "down",
  "ArrowLeft": "left",
  "ArrowRight": "right",
  "Home": "home",
  "End": "end",
  "PageUp": "pageup",
  "PageDown": "pagedown",
  "Space": "space",
  "Insert": "insert",
}

// ── Key matching ─────────────────────────────────────────

interface ParsedKeySpec {
  ctrl: boolean
  shift: boolean
  meta: boolean
  /** The base key — either a named key or a single char */
  base: string
  /** Whether base is a named key (matched against event.name) */
  isNamed: boolean
}

function parseKeySpec(spec: string): ParsedKeySpec {
  // Handle literal "+" — split on "+" would lose it since it's also the delimiter.
  // Detect trailing "+": bare "+" or modifier combo ending in "++" (e.g. "Ctrl++").
  let parts: string[]
  if (spec === "+" || spec.endsWith("++")) {
    // Strip the trailing "+" before splitting modifiers, then restore it as the base
    const prefix = spec.slice(0, -1)
    parts = prefix ? [...prefix.split("+"), "+"] : ["+"]
  } else {
    parts = spec.split("+")
  }
  let ctrl = false
  let shift = false
  let meta = false
  let base = parts[parts.length - 1]

  for (let i = 0; i < parts.length - 1; i++) {
    const mod = parts[i].toLowerCase()
    if (mod === "ctrl") ctrl = true
    else if (mod === "shift") shift = true
    else if (mod === "meta" || mod === "alt") meta = true
  }

  // Resolve aliases (e.g. "Enter" → "return")
  const aliased = KEY_ALIASES[base]
  if (aliased) base = aliased

  const isNamed = NAMED_KEYS.has(base.toLowerCase())
  if (isNamed) base = base.toLowerCase()

  // Uppercase single character implies shift (e.g. "W" means Shift+w)
  if (!isNamed && base.length === 1 && base !== base.toLowerCase() && !shift) {
    shift = true
  }

  return { ctrl, shift, meta, base, isNamed }
}

/**
 * Check if a KeyEvent matches a single key spec string.
 */
export function matchesKey(event: KeyEvent, spec: string): boolean {
  const parsed = parseKeySpec(spec)

  if (parsed.ctrl !== event.ctrl) return false
  if (parsed.shift !== event.shift) return false
  if (parsed.meta !== (event.meta || event.option)) return false

  if (parsed.isNamed) {
    return event.name === parsed.base
  }

  // Single character match — use event.raw for printable chars
  return event.raw === parsed.base
}

// ── KeybindRegistry ──────────────────────────────────────

export class KeybindRegistry {
  private scopes: Map<string, Scope> = new Map()
  private scopeStack: Scope[] = []

  registerScope(name: string, priority: number, opaque = false): () => void {
    const existing = this.scopes.get(name)
    if (existing) {
      // Update priority/opaque on re-register, keep bindings
      existing.priority = priority
      existing.opaque = opaque
      existing.active = true
      this.rebuildStack()
      return () => this.unregisterScope(name)
    }

    const scope: Scope = { name, priority, opaque, active: true, bindings: new Map() }
    this.scopes.set(name, scope)
    this.rebuildStack()
    return () => this.unregisterScope(name)
  }

  unregisterScope(name: string): void {
    this.scopes.delete(name)
    this.rebuildStack()
  }

  /** Deactivate a scope without destroying it or its bindings. */
  deactivateScope(name: string): void {
    const scope = this.scopes.get(name)
    if (scope) {
      scope.active = false
      this.rebuildStack()
    }
  }

  registerBinding(scopeName: string, binding: KeyBinding): () => void {
    const scope = this.scopes.get(scopeName)
    if (!scope) {
      // Scope may have been unregistered during a React effect cycle
      // (e.g. overlay closes → scope deactivates → stale binding effect fires).
      // Return a no-op cleanup instead of crashing.
      return () => {}
    }
    scope.bindings.set(binding.id, binding)
    return () => this.unregisterBinding(scopeName, binding.id)
  }

  unregisterBinding(scopeName: string, bindingId: string): void {
    const scope = this.scopes.get(scopeName)
    if (scope) {
      scope.bindings.delete(bindingId)
    }
  }

  dispatch(event: KeyEvent): boolean {
    for (const scope of this.scopeStack) {
      for (const binding of scope.bindings.values()) {
        const keys = Array.isArray(binding.key) ? binding.key : [binding.key]
        for (const key of keys) {
          if (matchesKey(event, key)) {
            binding.handler(event)
            return true
          }
        }
      }
      // Opaque scope blocks propagation even on miss
      if (scope.opaque) return false
    }
    return false
  }

  getActiveBindings(): Array<{ scope: string; key: string; description?: string }> {
    const result: Array<{ scope: string; key: string; description?: string }> = []
    for (const scope of this.scopeStack) {
      for (const binding of scope.bindings.values()) {
        const keys = Array.isArray(binding.key) ? binding.key : [binding.key]
        for (const key of keys) {
          result.push({ scope: scope.name, key, description: binding.description })
        }
      }
    }
    return result
  }

  private rebuildStack(): void {
    this.scopeStack = Array.from(this.scopes.values())
      .filter((s) => s.active)
      .sort((a, b) => b.priority - a.priority)
  }
}
