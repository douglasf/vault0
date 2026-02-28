import { createContext, createElement, useContext, useRef } from "react"
import { useKeyboard } from "@opentui/react"
import type { KeyEvent } from "@opentui/core"
import type { ReactNode } from "react"
import { KeybindRegistry } from "./keybind-registry.js"

// ── Context ──────────────────────────────────────────────

const KeybindContext = createContext<KeybindRegistry | null>(null)

// ── Provider ─────────────────────────────────────────────

export interface KeybindProviderProps {
  children: ReactNode
  registry?: KeybindRegistry
}

export function KeybindProvider({ children, registry: externalRegistry }: KeybindProviderProps): ReactNode {
  const registryRef = useRef<KeybindRegistry>(externalRegistry ?? new KeybindRegistry())

  useKeyboard((event: KeyEvent) => {
    const handled = registryRef.current.dispatch(event)
    if (handled) {
      event.preventDefault()
    }
  })

  return createElement(KeybindContext, { value: registryRef.current }, children)
}

// ── Hook ─────────────────────────────────────────────────

export function useKeybindRegistry(): KeybindRegistry {
  const ctx = useContext(KeybindContext)
  if (!ctx) {
    throw new Error("useKeybindRegistry must be called within a KeybindProvider")
  }
  return ctx
}
