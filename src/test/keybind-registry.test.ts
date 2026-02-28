import { describe, test, expect, beforeEach } from "bun:test"
import { KeyEvent } from "@opentui/core"
import { KeybindRegistry, matchesKey } from "../lib/keybind-registry.js"

// ── Helpers ──────────────────────────────────────────────

/** Create a minimal KeyEvent-like object for testing */
function makeKeyEvent(overrides: Partial<KeyEvent> = {}): KeyEvent {
  const base: KeyEvent = {
    name: "",
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    sequence: "",
    number: false,
    raw: "",
    eventType: "press",
    source: "raw",
    get defaultPrevented() { return false },
    get propagationStopped() { return false },
    preventDefault() { /* noop */ },
    stopPropagation() { /* noop */ },
  } as KeyEvent
  return Object.assign(base, overrides)
}

// ── matchesKey ───────────────────────────────────────────

describe("matchesKey", () => {
  test("matches single character via event.raw", () => {
    const event = makeKeyEvent({ raw: "c" })
    expect(matchesKey(event, "c")).toBe(true)
    expect(matchesKey(event, "x")).toBe(false)
  })

  test("matches special characters (?, /, +)", () => {
    expect(matchesKey(makeKeyEvent({ raw: "?" }), "?")).toBe(true)
    expect(matchesKey(makeKeyEvent({ raw: "/" }), "/")).toBe(true)
    expect(matchesKey(makeKeyEvent({ raw: "+" }), "+")).toBe(true)
    expect(matchesKey(makeKeyEvent({ raw: "-" }), "+")).toBe(false)
  })

  test("matches named keys via event.name (Enter → return)", () => {
    const event = makeKeyEvent({ name: "return", raw: "\r" })
    expect(matchesKey(event, "Enter")).toBe(true)
    expect(matchesKey(event, "Escape")).toBe(false)
  })

  test("matches Escape", () => {
    const event = makeKeyEvent({ name: "escape", raw: "\x1b" })
    expect(matchesKey(event, "Escape")).toBe(true)
  })

  test("matches Tab", () => {
    const event = makeKeyEvent({ name: "tab", raw: "\t" })
    expect(matchesKey(event, "Tab")).toBe(true)
  })

  test("matches arrow keys", () => {
    expect(matchesKey(makeKeyEvent({ name: "up" }), "ArrowUp")).toBe(true)
    expect(matchesKey(makeKeyEvent({ name: "down" }), "ArrowDown")).toBe(true)
    expect(matchesKey(makeKeyEvent({ name: "left" }), "ArrowLeft")).toBe(true)
    expect(matchesKey(makeKeyEvent({ name: "right" }), "ArrowRight")).toBe(true)
  })

  test("matches Ctrl+key", () => {
    const event = makeKeyEvent({ ctrl: true, raw: "s" })
    expect(matchesKey(event, "Ctrl+s")).toBe(true)
    expect(matchesKey(event, "s")).toBe(false) // ctrl mismatch
  })

  test("matches Shift+Tab", () => {
    const event = makeKeyEvent({ shift: true, name: "tab" })
    expect(matchesKey(event, "Shift+Tab")).toBe(true)
    expect(matchesKey(event, "Tab")).toBe(false) // shift mismatch
  })

  test("does not match when modifier is extra", () => {
    const event = makeKeyEvent({ ctrl: true, raw: "c" })
    expect(matchesKey(event, "c")).toBe(false)
  })
})

// ── KeybindRegistry ──────────────────────────────────────

describe("KeybindRegistry", () => {
  let registry: KeybindRegistry

  beforeEach(() => {
    registry = new KeybindRegistry()
  })

  // ── Scope registration ────────────────────────────────

  describe("scope registration", () => {
    test("registerScope returns cleanup function", () => {
      const cleanup = registry.registerScope("board", 10)
      expect(typeof cleanup).toBe("function")
    })

    test("unregisterScope removes scope and its bindings", () => {
      registry.registerScope("board", 10)
      registry.registerBinding("board", {
        id: "b1", key: "c", handler: () => {},
      })
      registry.unregisterScope("board")
      expect(registry.getActiveBindings()).toHaveLength(0)
    })

    test("cleanup function unregisters scope", () => {
      const cleanup = registry.registerScope("board", 10)
      registry.registerBinding("board", {
        id: "b1", key: "c", handler: () => {},
      })
      cleanup()
      expect(registry.getActiveBindings()).toHaveLength(0)
    })

    test("re-registering same scope updates priority but keeps bindings", () => {
      registry.registerScope("board", 10)
      registry.registerBinding("board", {
        id: "b1", key: "c", handler: () => {},
      })
      registry.registerScope("board", 20)
      expect(registry.getActiveBindings()).toHaveLength(1)
    })
  })

  // ── Binding registration ──────────────────────────────

  describe("binding registration", () => {
    test("registerBinding returns no-op cleanup if scope does not exist", () => {
      const cleanup = registry.registerBinding("nonexistent", {
        id: "b1", key: "c", handler: () => {},
      })
      expect(typeof cleanup).toBe("function")
      cleanup() // should not throw
      expect(registry.getActiveBindings()).toHaveLength(0)
    })

    test("registerBinding returns cleanup function", () => {
      registry.registerScope("board", 10)
      const cleanup = registry.registerBinding("board", {
        id: "b1", key: "c", handler: () => {},
      })
      expect(typeof cleanup).toBe("function")
      cleanup()
      expect(registry.getActiveBindings()).toHaveLength(0)
    })

    test("unregisterBinding removes specific binding", () => {
      registry.registerScope("board", 10)
      registry.registerBinding("board", {
        id: "b1", key: "c", handler: () => {},
      })
      registry.registerBinding("board", {
        id: "b2", key: "d", handler: () => {},
      })
      registry.unregisterBinding("board", "b1")
      const bindings = registry.getActiveBindings()
      expect(bindings).toHaveLength(1)
      expect(bindings[0].key).toBe("d")
    })
  })

  // ── Dispatch ──────────────────────────────────────────

  describe("dispatch", () => {
    test("dispatches to matching binding and returns true", () => {
      registry.registerScope("board", 10)
      let called = false
      registry.registerBinding("board", {
        id: "b1", key: "c", handler: () => { called = true },
      })
      const result = registry.dispatch(makeKeyEvent({ raw: "c" }))
      expect(result).toBe(true)
      expect(called).toBe(true)
    })

    test("returns false when no binding matches", () => {
      registry.registerScope("board", 10)
      const result = registry.dispatch(makeKeyEvent({ raw: "x" }))
      expect(result).toBe(false)
    })

    test("higher priority scope wins over lower", () => {
      registry.registerScope("root", 0)
      registry.registerScope("overlay", 20)
      const calls: string[] = []
      registry.registerBinding("root", {
        id: "r1", key: "c", handler: () => { calls.push("root") },
      })
      registry.registerBinding("overlay", {
        id: "o1", key: "c", handler: () => { calls.push("overlay") },
      })
      registry.dispatch(makeKeyEvent({ raw: "c" }))
      expect(calls).toEqual(["overlay"])
    })

    test("falls through non-opaque scope to lower priority", () => {
      registry.registerScope("overlay", 20, false)
      registry.registerScope("root", 0)
      let called = false
      registry.registerBinding("root", {
        id: "r1", key: "c", handler: () => { called = true },
      })
      const result = registry.dispatch(makeKeyEvent({ raw: "c" }))
      expect(result).toBe(true)
      expect(called).toBe(true)
    })

    test("opaque scope blocks propagation even on miss", () => {
      registry.registerScope("modal", 20, true)
      registry.registerScope("root", 0)
      let called = false
      registry.registerBinding("root", {
        id: "r1", key: "c", handler: () => { called = true },
      })
      // modal has no binding for "c" but is opaque
      const result = registry.dispatch(makeKeyEvent({ raw: "c" }))
      expect(result).toBe(false)
      expect(called).toBe(false)
    })

    test("opaque scope still dispatches its own bindings", () => {
      registry.registerScope("modal", 20, true)
      let called = false
      registry.registerBinding("modal", {
        id: "m1", key: "Escape", handler: () => { called = true },
      })
      const result = registry.dispatch(makeKeyEvent({ name: "escape", raw: "\x1b" }))
      expect(result).toBe(true)
      expect(called).toBe(true)
    })

    test("supports array of keys on a binding", () => {
      registry.registerScope("board", 10)
      let called = false
      registry.registerBinding("board", {
        id: "b1", key: ["k", "ArrowUp"], handler: () => { called = true },
      })
      expect(registry.dispatch(makeKeyEvent({ raw: "k" }))).toBe(true)
      expect(called).toBe(true)
      called = false
      expect(registry.dispatch(makeKeyEvent({ name: "up" }))).toBe(true)
      expect(called).toBe(true)
    })
  })

  // ── getActiveBindings ─────────────────────────────────

  describe("getActiveBindings", () => {
    test("returns all bindings with scope name and description", () => {
      registry.registerScope("board", 10)
      registry.registerBinding("board", {
        id: "b1", key: "c", handler: () => {}, description: "Create task",
      })
      registry.registerBinding("board", {
        id: "b2", key: ["j", "ArrowDown"], handler: () => {}, description: "Move down",
      })
      const bindings = registry.getActiveBindings()
      expect(bindings).toHaveLength(3) // "c", "j", "ArrowDown"
      expect(bindings[0]).toEqual({ scope: "board", key: "c", description: "Create task" })
    })

    test("returns bindings sorted by scope priority (highest first)", () => {
      registry.registerScope("root", 0)
      registry.registerScope("overlay", 20)
      registry.registerBinding("overlay", {
        id: "o1", key: "Escape", handler: () => {}, description: "Close",
      })
      registry.registerBinding("root", {
        id: "r1", key: "?", handler: () => {}, description: "Help",
      })
      const bindings = registry.getActiveBindings()
      expect(bindings[0].scope).toBe("overlay")
      expect(bindings[1].scope).toBe("root")
    })

    test("returns empty array when no bindings registered", () => {
      expect(registry.getActiveBindings()).toEqual([])
    })
  })
})
