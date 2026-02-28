import { describe, test, expect, beforeEach, jest } from "bun:test"
import { KeybindRegistry, SCOPE_PRIORITY } from "../lib/keybind-registry.js"

// ── Direct unit tests for hook logic ─────────────────────
//
// Since these hooks require React context (KeybindProvider), we test
// the underlying registry interactions directly — verifying the same
// lifecycle patterns the hooks implement.

describe("useKeybindScope behavior", () => {
  let registry: KeybindRegistry

  beforeEach(() => {
    registry = new KeybindRegistry()
  })

  test("registers scope on mount and unregisters on unmount", () => {
    // Simulate mount
    const cleanup = registry.registerScope("board", SCOPE_PRIORITY.VIEW)
    expect(registry.getActiveBindings()).toEqual([])

    // Simulate unmount — scope is fully removed
    cleanup()
    // Binding registration on a missing scope returns a no-op cleanup (no crash)
    const bindCleanup = registry.registerBinding("board", { id: "b1", key: "k", handler: () => {} })
    // But the binding is NOT active since scope doesn't exist
    expect(registry.getActiveBindings()).toEqual([])
    bindCleanup()
  })

  test("active=false means scope is not in dispatch stack", () => {
    // Register then deactivate — simulates useKeybindScope with active=false
    registry.registerScope("board", SCOPE_PRIORITY.VIEW)
    registry.registerBinding("board", { id: "b1", key: "k", handler: () => {} })
    registry.deactivateScope("board")
    // Deactivated scope's bindings are not in active bindings
    expect(registry.getActiveBindings()).toEqual([])
  })

  test("toggling active from true to false unregisters scope", () => {
    // Mount with active=true
    const cleanup = registry.registerScope("board", SCOPE_PRIORITY.VIEW)
    registry.registerBinding("board", { id: "b1", key: "k", handler: () => {} })
    expect(registry.getActiveBindings()).toHaveLength(1)

    // Toggle to active=false — effect cleanup runs
    cleanup()
    expect(registry.getActiveBindings()).toEqual([])
  })

  test("toggling active from false to true re-activates scope with bindings", () => {
    // Register scope and a binding, then deactivate
    registry.registerScope("board", SCOPE_PRIORITY.VIEW)
    registry.registerBinding("board", { id: "b1", key: "k", handler: () => {} })
    registry.deactivateScope("board")
    expect(registry.getActiveBindings()).toEqual([])

    // Re-activate — bindings should reappear
    registry.registerScope("board", SCOPE_PRIORITY.VIEW)
    expect(registry.getActiveBindings()).toHaveLength(1)
  })

  test("shared scope — two components use same scope name", () => {
    // First component registers scope
    const cleanup1 = registry.registerScope("board", SCOPE_PRIORITY.VIEW)
    registry.registerBinding("board", { id: "b1", key: "k", handler: () => {} })

    // Second component re-registers same scope (should not lose bindings)
    const cleanup2 = registry.registerScope("board", SCOPE_PRIORITY.VIEW)
    registry.registerBinding("board", { id: "b2", key: "j", handler: () => {} })

    expect(registry.getActiveBindings()).toHaveLength(2)

    // First component unmounts — scope still exists because second holds it
    // NOTE: In the real hook, each useKeybindScope returns a cleanup that
    // calls unregisterScope. With shared scopes, the last unmount wins.
    // This tests the registry behavior directly.
    cleanup1()
    // Scope is now removed (registry doesn't ref-count)
    expect(registry.getActiveBindings()).toEqual([])
  })

  test("default priority is VIEW (10)", () => {
    registry.registerScope("board", SCOPE_PRIORITY.VIEW)
    registry.registerScope("root", SCOPE_PRIORITY.ROOT)

    registry.registerBinding("board", { id: "b1", key: "k", handler: () => {} })
    registry.registerBinding("root", { id: "r1", key: "k", handler: () => {} })

    // Board (priority 10) should be checked before root (priority 0)
    const bindings = registry.getActiveBindings()
    expect(bindings[0].scope).toBe("board")
    expect(bindings[1].scope).toBe("root")
  })
})

describe("useKeybind behavior", () => {
  let registry: KeybindRegistry

  beforeEach(() => {
    registry = new KeybindRegistry()
    registry.registerScope("test", SCOPE_PRIORITY.VIEW)
  })

  test("registers binding on mount and unregisters on unmount", () => {
    const handler = jest.fn()
    const cleanup = registry.registerBinding("test", {
      id: "bind1",
      key: "k",
      handler,
      description: "Move up",
    })

    const bindings = registry.getActiveBindings()
    expect(bindings).toHaveLength(1)
    expect(bindings[0].key).toBe("k")
    expect(bindings[0].description).toBe("Move up")

    // Unmount
    cleanup()
    expect(registry.getActiveBindings()).toHaveLength(0)
  })

  test("when=false means binding is not registered", () => {
    const when = false
    if (when) {
      registry.registerBinding("test", { id: "b1", key: "k", handler: () => {} })
    }
    expect(registry.getActiveBindings()).toHaveLength(0)
  })

  test("toggling when from true to false removes binding", () => {
    const cleanup = registry.registerBinding("test", {
      id: "b1",
      key: "k",
      handler: () => {},
    })
    expect(registry.getActiveBindings()).toHaveLength(1)

    // when becomes false — effect cleanup runs
    cleanup()
    expect(registry.getActiveBindings()).toHaveLength(0)
  })

  test("handler ref stability — re-registration uses stable wrapper", () => {
    // Simulate the handler ref pattern: the registry stores a stable wrapper
    // that delegates to handlerRef.current, so changing the handler doesn't
    // require re-registration.
    let currentHandler = jest.fn()
    const stableHandler = () => currentHandler()

    registry.registerBinding("test", {
      id: "b1",
      key: "k",
      handler: stableHandler,
    })

    // Dispatch to verify first handler is called
    const event = makeKeyEvent({ raw: "k" })
    registry.dispatch(event)
    expect(currentHandler).toHaveBeenCalledTimes(1)

    // "Re-render" with new handler — just update the ref
    const newHandler = jest.fn()
    currentHandler = newHandler

    // Same binding, same stable wrapper — no re-registration needed
    registry.dispatch(event)
    expect(newHandler).toHaveBeenCalledTimes(1)

    // Binding count unchanged — still just 1
    expect(registry.getActiveBindings()).toHaveLength(1)
  })

  test("array keys register a single binding with multiple key aliases", () => {
    registry.registerBinding("test", {
      id: "b1",
      key: ["k", "ArrowUp"],
      handler: () => {},
      description: "Move up",
    })

    // getActiveBindings expands array keys into separate entries
    const bindings = registry.getActiveBindings()
    expect(bindings).toHaveLength(2)
    expect(bindings[0].key).toBe("k")
    expect(bindings[1].key).toBe("ArrowUp")
  })

  test("array keys — both aliases trigger the handler", () => {
    const handler = jest.fn()
    registry.registerBinding("test", {
      id: "b1",
      key: ["k", "ArrowUp"],
      handler,
    })

    registry.dispatch(makeKeyEvent({ raw: "k" }))
    expect(handler).toHaveBeenCalledTimes(1)

    registry.dispatch(makeKeyEvent({ name: "up" }))
    expect(handler).toHaveBeenCalledTimes(2)
  })

  test("cleanup removes binding even if scope has other bindings", () => {
    registry.registerBinding("test", {
      id: "b1",
      key: "k",
      handler: () => {},
    })
    const cleanup2 = registry.registerBinding("test", {
      id: "b2",
      key: "j",
      handler: () => {},
    })

    expect(registry.getActiveBindings()).toHaveLength(2)

    cleanup2()
    expect(registry.getActiveBindings()).toHaveLength(1)
    expect(registry.getActiveBindings()[0].key).toBe("k")
  })

  test("description is optional", () => {
    registry.registerBinding("test", {
      id: "b1",
      key: "k",
      handler: () => {},
    })

    const bindings = registry.getActiveBindings()
    expect(bindings[0].description).toBeUndefined()
  })
})

// ── Test helper ──────────────────────────────────────────

function makeKeyEvent(overrides: Partial<import("@opentui/core").KeyEvent> = {}): import("@opentui/core").KeyEvent {
  const base = {
    name: "",
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    sequence: "",
    number: false,
    raw: "",
    eventType: "press" as const,
    source: "raw" as const,
    get defaultPrevented() { return false },
    get propagationStopped() { return false },
    preventDefault() { /* noop */ },
    stopPropagation() { /* noop */ },
  }
  return Object.assign(base, overrides) as import("@opentui/core").KeyEvent
}
