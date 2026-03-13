import { describe, test, expect } from "bun:test"
import {
  hydrateUiState,
  sanitizeFilters,
  serializeUiState,
  isPersistableView,
} from "../lib/ui-config.js"
import type { UiConfig } from "../lib/config.js"

// ── isPersistableView ───────────────────────────────────────────────────

describe("isPersistableView", () => {
  test("accepts board, releases, archive", () => {
    expect(isPersistableView("board")).toBe(true)
    expect(isPersistableView("releases")).toBe(true)
    expect(isPersistableView("archive")).toBe(true)
  })

  test("rejects modal/transient modes", () => {
    expect(isPersistableView("detail")).toBe(false)
    expect(isPersistableView("create")).toBe(false)
    expect(isPersistableView("edit")).toBe(false)
    expect(isPersistableView("filter")).toBe(false)
  })

  test("rejects non-strings", () => {
    expect(isPersistableView(42)).toBe(false)
    expect(isPersistableView(null)).toBe(false)
    expect(isPersistableView(undefined)).toBe(false)
  })
})

// ── sanitizeFilters ─────────────────────────────────────────────────────

describe("sanitizeFilters", () => {
  test("passes through valid filter values", () => {
    const result = sanitizeFilters({
      statuses: ["backlog", "todo"],
      priorities: ["high"],
      sources: ["manual"],
      tags: ["ui"],
      readyOnly: true,
    })
    expect(result.statuses).toEqual(["backlog", "todo"])
    expect(result.priorities).toEqual(["high"])
    expect(result.sources).toEqual(["manual"])
    expect(result.tags).toEqual(["ui"])
    expect(result.readyOnly).toBe(true)
  })

  test("drops invalid enum values from arrays", () => {
    const result = sanitizeFilters({
      statuses: ["backlog", "invalid_status", "todo"],
      priorities: ["high", "mega"],
    })
    expect(result.statuses).toEqual(["backlog", "todo"])
    expect(result.priorities).toEqual(["high"])
  })

  test("returns empty object for null/undefined input", () => {
    expect(sanitizeFilters(null)).toEqual({})
    expect(sanitizeFilters(undefined)).toEqual({})
  })

  test("drops array fields that become empty after filtering", () => {
    const result = sanitizeFilters({
      statuses: ["not_a_status"],
    })
    expect(result.statuses).toBeUndefined()
  })

  test("ignores non-boolean readyOnly/blockedOnly", () => {
    const result = sanitizeFilters({
      readyOnly: "yes",
      blockedOnly: 1,
    })
    expect(result.readyOnly).toBeUndefined()
    expect(result.blockedOnly).toBeUndefined()
  })

  test("allows arbitrary string tags (no enum check)", () => {
    const result = sanitizeFilters({
      tags: ["custom-tag", "another"],
      tagsAll: ["all-match"],
    })
    expect(result.tags).toEqual(["custom-tag", "another"])
    expect(result.tagsAll).toEqual(["all-match"])
  })
})

// ── hydrateUiState ──────────────────────────────────────────────────────

describe("hydrateUiState", () => {
  const boards = ["board-1", "board-2", "board-3"]

  test("returns defaults when no config provided", () => {
    const state = hydrateUiState({
      availableBoardIds: boards,
      fallbackBoardId: "board-1",
    })
    expect(state.currentBoardId).toBe("board-1")
    expect(state.sortField).toBe("priority")
    expect(state.previewVisible).toBe(false)
    expect(state.hideSubtasks).toBe(false)
    expect(state.filters).toEqual({})
    expect(state.activeView).toBe("board")
  })

  test("uses config values when valid", () => {
    const config: UiConfig = {
      currentBoardId: "board-2",
      sortField: "title",
      previewVisible: true,
      hideSubtasks: true,
      filters: { priorities: ["high", "critical"] },
    }
    const state = hydrateUiState({
      config,
      availableBoardIds: boards,
      fallbackBoardId: "board-1",
    })
    expect(state.currentBoardId).toBe("board-2")
    expect(state.sortField).toBe("title")
    expect(state.previewVisible).toBe(true)
    expect(state.hideSubtasks).toBe(true)
    expect(state.filters.priorities).toEqual(["high", "critical"])
  })

  test("falls back to fallbackBoardId when configured board is missing", () => {
    const config: UiConfig = { currentBoardId: "deleted-board" }
    const state = hydrateUiState({
      config,
      availableBoardIds: boards,
      fallbackBoardId: "board-1",
    })
    expect(state.currentBoardId).toBe("board-1")
  })

  test("falls back on invalid sortField", () => {
    const config: UiConfig = { sortField: "invalid" as any }
    const state = hydrateUiState({
      config,
      availableBoardIds: boards,
      fallbackBoardId: "board-1",
    })
    expect(state.sortField).toBe("priority")
  })

  test("falls back on non-boolean previewVisible/hideSubtasks", () => {
    const config: UiConfig = {
      previewVisible: "yes" as any,
      hideSubtasks: 1 as any,
    }
    const state = hydrateUiState({
      config,
      availableBoardIds: boards,
      fallbackBoardId: "board-1",
    })
    expect(state.previewVisible).toBe(false)
    expect(state.hideSubtasks).toBe(false)
  })

  test("sanitizes filters during hydration", () => {
    const config: UiConfig = {
      filters: {
        statuses: ["backlog", "garbage" as any],
        priorities: ["high"],
      },
    }
    const state = hydrateUiState({
      config,
      availableBoardIds: boards,
      fallbackBoardId: "board-1",
    })
    expect(state.filters.statuses).toEqual(["backlog"])
    expect(state.filters.priorities).toEqual(["high"])
  })
})

// ── serializeUiState ────────────────────────────────────────────────────

describe("serializeUiState", () => {
  test("serializes full state to UiConfig", () => {
    const result = serializeUiState({
      currentBoardId: "board-1",
      sortField: "title",
      previewVisible: true,
      hideSubtasks: false,
      filters: { priorities: ["high"] },
    })
    expect(result.currentBoardId).toBe("board-1")
    expect(result.sortField).toBe("title")
    expect(result.previewVisible).toBe(true)
    expect(result.hideSubtasks).toBe(false)
    expect(result.filters).toEqual({ priorities: ["high"] })
  })

  test("includes empty filters to ensure local override of global", () => {
    const result = serializeUiState({
      currentBoardId: "board-1",
      sortField: "priority",
      previewVisible: false,
      hideSubtasks: false,
      filters: {},
    })
    expect(result.filters).toEqual({})
  })

  test("excludes search from serialized filters", () => {
    const result = serializeUiState({
      currentBoardId: "board-1",
      sortField: "priority",
      previewVisible: false,
      hideSubtasks: false,
      filters: { priorities: ["high"], search: "query" } as any,
    })
    expect(result.filters).toEqual({ priorities: ["high"] })
    expect((result.filters as any)?.search).toBeUndefined()
  })
})
