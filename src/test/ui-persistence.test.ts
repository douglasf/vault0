import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  loadConfig,
  saveProjectConfig,
  pruneDefaultUi,
  UI_CONFIG_DEFAULTS,
} from "../lib/config.js"
import type { Vault0Config, UiConfig } from "../lib/config.js"
import { hydrateUiState, serializeUiState } from "../lib/ui-config.js"
import type { HydratedUiState } from "../lib/ui-config.js"

// ── Helpers ─────────────────────────────────────────────────────────────

function makeTempRepo(): string {
  return mkdtempSync(join(tmpdir(), "vault0-ui-persist-"))
}

function writeProjectConfig(repoRoot: string, config: Vault0Config): void {
  mkdirSync(join(repoRoot, ".vault0"), { recursive: true })
  writeFileSync(
    join(repoRoot, ".vault0", "config.json"),
    JSON.stringify(config, null, 2),
  )
}

function readProjectConfigRaw(repoRoot: string): Record<string, unknown> {
  const raw = readFileSync(join(repoRoot, ".vault0", "config.json"), "utf-8")
  return JSON.parse(raw)
}

// ═══════════════════════════════════════════════════════════════════
// pruneDefaultUi
// ═══════════════════════════════════════════════════════════════════

describe("pruneDefaultUi", () => {
  test("returns undefined when all values are defaults", () => {
    const result = pruneDefaultUi({
      sortField: "priority",
      previewVisible: false,
      hideSubtasks: false,
    })
    expect(result).toBeUndefined()
  })

  test("returns undefined for empty object", () => {
    expect(pruneDefaultUi({})).toBeUndefined()
  })

  test("keeps currentBoardId even though it has no default", () => {
    const result = pruneDefaultUi({ currentBoardId: "board-123" })
    expect(result).toEqual({ currentBoardId: "board-123" })
  })

  test("keeps non-default sortField, prunes default previewVisible/hideSubtasks", () => {
    const result = pruneDefaultUi({
      sortField: "title",
      previewVisible: false,
      hideSubtasks: false,
    })
    expect(result).toEqual({ sortField: "title" })
  })

  test("keeps non-default previewVisible (true)", () => {
    const result = pruneDefaultUi({ previewVisible: true })
    expect(result).toEqual({ previewVisible: true })
  })

  test("keeps non-default hideSubtasks (true)", () => {
    const result = pruneDefaultUi({ hideSubtasks: true })
    expect(result).toEqual({ hideSubtasks: true })
  })

  test("keeps filters with non-empty arrays", () => {
    const result = pruneDefaultUi({
      filters: { statuses: ["backlog", "todo"], priorities: ["high"] },
    })
    expect(result).toEqual({
      filters: { statuses: ["backlog", "todo"], priorities: ["high"] },
    })
  })

  test("prunes filters with only empty arrays", () => {
    const result = pruneDefaultUi({
      filters: { statuses: [], priorities: [] },
    })
    expect(result).toBeUndefined()
  })

  test("prunes null/undefined filter values but keeps valid ones", () => {
    const result = pruneDefaultUi({
      filters: {
        statuses: undefined,
        priorities: ["high"],
        readyOnly: null as any,
      },
    })
    expect(result?.filters).toEqual({ priorities: ["high"] })
  })

  test("keeps boolean filter values (readyOnly, blockedOnly)", () => {
    const result = pruneDefaultUi({
      filters: { readyOnly: true },
    })
    expect(result).toEqual({ filters: { readyOnly: true } })
  })

  test("prunes default filter booleans (false) and empty arrays", () => {
    const result = pruneDefaultUi({
      filters: {
        readyOnly: false,
        blockedOnly: false,
        showArchived: false,
        statuses: [],
        priorities: [],
        sources: [],
        tags: [],
        tagsAll: [],
      },
    })
    expect(result).toBeUndefined()
  })

  test("prunes false filter booleans but keeps true ones", () => {
    const result = pruneDefaultUi({
      filters: {
        readyOnly: true,
        blockedOnly: false,
        showArchived: false,
      },
    })
    expect(result).toEqual({ filters: { readyOnly: true } })
  })

  test("keeps mixed non-default values together", () => {
    const result = pruneDefaultUi({
      currentBoardId: "b1",
      sortField: "updated",
      previewVisible: true,
      hideSubtasks: true,
      filters: { tags: ["ui"] },
    })
    expect(result).toEqual({
      currentBoardId: "b1",
      sortField: "updated",
      previewVisible: true,
      hideSubtasks: true,
      filters: { tags: ["ui"] },
    })
  })
})

// ═══════════════════════════════════════════════════════════════════
// saveProjectConfig — non-default writing and pruning
// ═══════════════════════════════════════════════════════════════════

describe("saveProjectConfig writes only non-default UI values", () => {
  let repo: string

  beforeEach(() => { repo = makeTempRepo() })
  afterEach(() => {
    try { rmSync(repo, { recursive: true, force: true }) } catch { /* best-effort */ }
  })

  test("writes only non-default UI values to disk (pruned)", () => {
    saveProjectConfig(repo, {
      ui: {
        currentBoardId: "board-abc",
        sortField: "title",
        previewVisible: true,
        hideSubtasks: false,
      },
    })
    const raw = readProjectConfigRaw(repo)
    const ui = raw.ui as UiConfig
    expect(ui.currentBoardId).toBe("board-abc")
    expect(ui.sortField).toBe("title")
    expect(ui.previewVisible).toBe(true)
    // hideSubtasks=false is default, should be pruned
    expect(ui.hideSubtasks).toBeUndefined()
  })

  test("writes ui: {} when all values are defaults (signals local ownership)", () => {
    saveProjectConfig(repo, {
      ui: {
        sortField: "priority",
        previewVisible: false,
        hideSubtasks: false,
      },
    })
    const raw = readProjectConfigRaw(repo)
    // ui key is present (as empty object) to signal local ownership
    expect(raw.ui).toEqual({})
  })

  test("preserves unrelated config keys when updating ui", () => {
    writeProjectConfig(repo, {
      theme: { name: "selenized", appearance: "dark" },
      lanePolicies: { in_progress: { wipLimit: 3 } },
    })

    saveProjectConfig(repo, {
      ui: { currentBoardId: "b1", sortField: "updated" },
    })

    const raw = readProjectConfigRaw(repo)
    expect((raw.theme as any).name).toBe("selenized")
    expect((raw.lanePolicies as any).in_progress.wipLimit).toBe(3)
    expect((raw.ui as UiConfig).currentBoardId).toBe("b1")
  })

  test("overwrites ui section when resetting to defaults", () => {
    // First write non-default values
    saveProjectConfig(repo, {
      ui: { sortField: "title", previewVisible: true },
    })
    expect(readProjectConfigRaw(repo).ui).toBeDefined()

    // Now reset to defaults — ui key is present as {} (pruned but signals ownership)
    saveProjectConfig(repo, {
      ui: { sortField: "priority", previewVisible: false },
    })
    const raw = readProjectConfigRaw(repo)
    expect(raw.ui).toEqual({})
  })

  test("writes filters only when non-empty", () => {
    saveProjectConfig(repo, {
      ui: {
        currentBoardId: "b1",
        filters: { statuses: ["backlog"], readyOnly: true },
      },
    })
    const raw = readProjectConfigRaw(repo)
    expect((raw.ui as UiConfig).filters).toEqual({
      statuses: ["backlog"],
      readyOnly: true,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════
// Global + local merge: local UI overrides global, theme still works
// ═══════════════════════════════════════════════════════════════════

describe("global+local config merge with UI", () => {
  let repo: string

  beforeEach(() => { repo = makeTempRepo() })
  afterEach(() => {
    try { rmSync(repo, { recursive: true, force: true }) } catch { /* best-effort */ }
  })

  test("local UI overrides global UI field-by-field", () => {
    // We can't easily write to the actual global config, so we test
    // loadConfig behavior via project-local config which merges with global.
    // Instead, test the merge semantics by writing project config with UI
    // and verifying loadConfig picks it up.
    writeProjectConfig(repo, {
      ui: {
        currentBoardId: "local-board",
        sortField: "title",
        previewVisible: true,
      },
    })

    const config = loadConfig(repo)
    expect(config.ui?.currentBoardId).toBe("local-board")
    expect(config.ui?.sortField).toBe("title")
    expect(config.ui?.previewVisible).toBe(true)
  })

  test("theme from project config is preserved alongside UI", () => {
    writeProjectConfig(repo, {
      theme: { name: "selenized", appearance: "dark" },
      ui: { sortField: "updated" },
    })

    const config = loadConfig(repo)
    expect(config.theme?.name).toBe("selenized")
    expect(config.theme?.appearance).toBe("dark")
    expect(config.ui?.sortField).toBe("updated")
  })

  test("lanePolicies and UI coexist in merged config", () => {
    writeProjectConfig(repo, {
      lanePolicies: { in_progress: { wipLimit: 5 } },
      ui: { hideSubtasks: true, filters: { tags: ["urgent"] } },
    })

    const config = loadConfig(repo)
    expect(config.lanePolicies?.in_progress?.wipLimit).toBe(5)
    expect(config.ui?.hideSubtasks).toBe(true)
    expect(config.ui?.filters?.tags).toEqual(["urgent"])
  })

  test("loadConfig without project config returns no UI section", () => {
    const config = loadConfig(repo)
    // No project config file — UI should be undefined (only global applies)
    expect(config.ui).toBeUndefined()
  })

  test("local config with ui key blocks global ui entirely", () => {
    // Simulate: project config has ui key (even with pruned defaults).
    // Global might have previewVisible=true, but local `ui` ownership blocks it.

    // Step 1: Write project config with non-default values
    writeProjectConfig(repo, { ui: { sortField: "title" } })
    const before = loadConfig(repo)
    expect(before.ui?.sortField).toBe("title")

    // Step 2: Save via saveProjectConfig with all defaults — gets pruned to ui: {}
    saveProjectConfig(repo, { ui: { previewVisible: false, sortField: "priority" } })

    // Step 3: Verify the file has ui: {} (pruned but present)
    const raw = readProjectConfigRaw(repo)
    expect(raw.ui).toEqual({})

    // Step 4: Verify loadConfig gives empty ui (not global values)
    const after = loadConfig(repo)
    expect(after.ui).toEqual({})
    expect(after.ui?.previewVisible).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════
// Startup hydration — full round-trip
// ═══════════════════════════════════════════════════════════════════

describe("startup hydration from persisted config", () => {
  const boards = ["board-1", "board-2", "board-3"]

  test("hydrates all fields from a fully populated config", () => {
    const config: UiConfig = {
      currentBoardId: "board-2",
      sortField: "updated",
      previewVisible: true,
      hideSubtasks: true,
      filters: {
        statuses: ["todo", "in_progress"],
        priorities: ["high", "critical"],
        tags: ["ui"],
        readyOnly: true,
      },
    }
    const state = hydrateUiState({
      config,
      availableBoardIds: boards,
      fallbackBoardId: "board-1",
    })
    expect(state.currentBoardId).toBe("board-2")
    expect(state.sortField).toBe("updated")
    expect(state.previewVisible).toBe(true)
    expect(state.hideSubtasks).toBe(true)
    expect(state.filters.statuses).toEqual(["todo", "in_progress"])
    expect(state.filters.priorities).toEqual(["high", "critical"])
    expect(state.filters.tags).toEqual(["ui"])
    expect(state.filters.readyOnly).toBe(true)
    expect(state.activeView).toBe("board")
  })

  test("falls back gracefully when currentBoardId does not exist", () => {
    const config: UiConfig = { currentBoardId: "deleted-board-id" }
    const state = hydrateUiState({
      config,
      availableBoardIds: boards,
      fallbackBoardId: "board-1",
    })
    expect(state.currentBoardId).toBe("board-1")
  })

  test("falls back when currentBoardId is not a string", () => {
    const config: UiConfig = { currentBoardId: 42 as any }
    const state = hydrateUiState({
      config,
      availableBoardIds: boards,
      fallbackBoardId: "board-1",
    })
    expect(state.currentBoardId).toBe("board-1")
  })

  test("falls back on invalid sortField values", () => {
    for (const bad of ["newest", "", 0, null, undefined, true]) {
      const state = hydrateUiState({
        config: { sortField: bad as any },
        availableBoardIds: boards,
        fallbackBoardId: "board-1",
      })
      expect(state.sortField).toBe("priority")
    }
  })

  test("falls back on non-boolean previewVisible and hideSubtasks", () => {
    for (const bad of ["true", 1, 0, null, "yes"]) {
      const state = hydrateUiState({
        config: { previewVisible: bad as any, hideSubtasks: bad as any },
        availableBoardIds: boards,
        fallbackBoardId: "board-1",
      })
      expect(state.previewVisible).toBe(false)
      expect(state.hideSubtasks).toBe(false)
    }
  })

  test("sanitizes invalid filter values during hydration", () => {
    const config: UiConfig = {
      filters: {
        statuses: ["todo", "nonsense" as any],
        priorities: ["mega" as any],
        sources: ["manual", "fake" as any],
      },
    }
    const state = hydrateUiState({
      config,
      availableBoardIds: boards,
      fallbackBoardId: "board-1",
    })
    expect(state.filters.statuses).toEqual(["todo"])
    // "mega" is invalid, all filtered out — should be undefined
    expect(state.filters.priorities).toBeUndefined()
    expect(state.filters.sources).toEqual(["manual"])
  })

  test("hydrates with no config (undefined) — all defaults", () => {
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

  test("hydrates with empty config object — all defaults", () => {
    const state = hydrateUiState({
      config: {},
      availableBoardIds: boards,
      fallbackBoardId: "board-1",
    })
    expect(state.currentBoardId).toBe("board-1")
    expect(state.sortField).toBe("priority")
    expect(state.previewVisible).toBe(false)
    expect(state.hideSubtasks).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Serialize → prune → hydrate round-trip
// ═══════════════════════════════════════════════════════════════════

describe("serialize → prune → hydrate round-trip", () => {
  const boards = ["board-1", "board-2"]

  test("non-default state survives a full round-trip", () => {
    const original: HydratedUiState = {
      currentBoardId: "board-2",
      sortField: "title",
      previewVisible: true,
      hideSubtasks: true,
      filters: { statuses: ["todo"], tags: ["important"] },
      activeView: "board",
    }

    const serialized = serializeUiState(original)
    const pruned = pruneDefaultUi(serialized)
    expect(pruned).toBeDefined()

    const hydrated = hydrateUiState({
      config: pruned!,
      availableBoardIds: boards,
      fallbackBoardId: "board-1",
    })

    expect(hydrated.currentBoardId).toBe("board-2")
    expect(hydrated.sortField).toBe("title")
    expect(hydrated.previewVisible).toBe(true)
    expect(hydrated.hideSubtasks).toBe(true)
    expect(hydrated.filters.statuses).toEqual(["todo"])
    expect(hydrated.filters.tags).toEqual(["important"])
  })

  test("activeView survives a full round-trip for non-board views", () => {
    for (const view of ["releases", "archive"] as const) {
      const original: HydratedUiState = {
        currentBoardId: "board-1",
        sortField: "priority",
        previewVisible: false,
        hideSubtasks: false,
        filters: {},
        activeView: view,
      }

      const serialized = serializeUiState(original)
      expect(serialized.activeView).toBe(view)

      const pruned = pruneDefaultUi(serialized)
      expect(pruned).toBeDefined()
      expect(pruned!.activeView).toBe(view)

      const hydrated = hydrateUiState({
        config: pruned!,
        availableBoardIds: boards,
        fallbackBoardId: "board-1",
      })
      expect(hydrated.activeView).toBe(view)
    }
  })

  test("activeView 'board' is pruned as default and hydrates back to board", () => {
    const original: HydratedUiState = {
      currentBoardId: "board-1",
      sortField: "priority",
      previewVisible: false,
      hideSubtasks: false,
      filters: {},
      activeView: "board",
    }

    const serialized = serializeUiState(original)
    const pruned = pruneDefaultUi(serialized)
    // activeView "board" is default — should be pruned
    expect(pruned?.activeView).toBeUndefined()

    // Hydrating without activeView should default to "board"
    const hydrated = hydrateUiState({
      config: pruned ?? {},
      availableBoardIds: boards,
      fallbackBoardId: "board-1",
    })
    expect(hydrated.activeView).toBe("board")
  })

  test("default state round-trips to defaults (pruned config is empty)", () => {
    const defaults: HydratedUiState = {
      currentBoardId: "board-1",
      sortField: "priority",
      previewVisible: false,
      hideSubtasks: false,
      filters: {},
      activeView: "board",
    }

    const serialized = serializeUiState(defaults)
    const pruned = pruneDefaultUi(serialized)
    // Only currentBoardId survives (it has no "default")
    expect(pruned?.currentBoardId).toBe("board-1")
    // Other fields are pruned
    expect(pruned?.sortField).toBeUndefined()
    expect(pruned?.previewVisible).toBeUndefined()
    expect(pruned?.hideSubtasks).toBeUndefined()
    expect(pruned?.filters).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════
// Multi-repo UI config isolation
// ═══════════════════════════════════════════════════════════════════

describe("multi-repo UI config isolation", () => {
  let repoA: string
  let repoB: string

  beforeEach(() => {
    repoA = makeTempRepo()
    repoB = makeTempRepo()
  })

  afterEach(() => {
    try { rmSync(repoA, { recursive: true, force: true }) } catch { /* best-effort */ }
    try { rmSync(repoB, { recursive: true, force: true }) } catch { /* best-effort */ }
  })

  test("UI config in repo A does not affect repo B", () => {
    saveProjectConfig(repoA, {
      ui: {
        currentBoardId: "board-a",
        sortField: "title",
        previewVisible: true,
        hideSubtasks: true,
        filters: { tags: ["repo-a-tag"] },
      },
    })

    const configA = loadConfig(repoA)
    const configB = loadConfig(repoB)

    expect(configA.ui?.currentBoardId).toBe("board-a")
    expect(configA.ui?.sortField).toBe("title")
    expect(configA.ui?.previewVisible).toBe(true)
    expect(configA.ui?.filters?.tags).toEqual(["repo-a-tag"])

    // Repo B should have no UI config
    expect(configB.ui?.currentBoardId).toBeUndefined()
    expect(configB.ui?.sortField).toBeUndefined()
    expect(configB.ui?.previewVisible).toBeUndefined()
  })

  test("each repo maintains independent UI state", () => {
    saveProjectConfig(repoA, {
      ui: { sortField: "title", previewVisible: true },
    })
    saveProjectConfig(repoB, {
      ui: { sortField: "updated", hideSubtasks: true },
    })

    const configA = loadConfig(repoA)
    const configB = loadConfig(repoB)

    expect(configA.ui?.sortField).toBe("title")
    expect(configA.ui?.previewVisible).toBe(true)
    expect(configA.ui?.hideSubtasks).toBeUndefined()

    expect(configB.ui?.sortField).toBe("updated")
    expect(configB.ui?.previewVisible).toBeUndefined()
    expect(configB.ui?.hideSubtasks).toBe(true)
  })

  test("updating repo A UI does not mutate repo B config file", () => {
    saveProjectConfig(repoA, { ui: { sortField: "title" } })
    saveProjectConfig(repoB, { ui: { sortField: "created" } })

    // Update repo A
    saveProjectConfig(repoA, { ui: { sortField: "updated", previewVisible: true } })

    // Repo B should be unchanged
    const rawB = readProjectConfigRaw(repoB)
    expect((rawB.ui as UiConfig).sortField).toBe("created")
    expect((rawB.ui as UiConfig).previewVisible).toBeUndefined()
  })

  test("resetting UI in repo A does not affect repo B", () => {
    saveProjectConfig(repoA, { ui: { sortField: "title" } })
    saveProjectConfig(repoB, { ui: { sortField: "created" } })

    // Reset repo A to defaults
    saveProjectConfig(repoA, { ui: { sortField: "priority" } })

    const rawA = readProjectConfigRaw(repoA)
    const configB = loadConfig(repoB)

    // Repo A has ui: {} (all defaults pruned, but key present)
    expect(rawA.ui).toEqual({})
    expect(configB.ui?.sortField).toBe("created")
  })

  test("repo with theme-only config has no UI leakage from other repos", () => {
    saveProjectConfig(repoA, {
      theme: { name: "selenized" },
      ui: { sortField: "title", previewVisible: true },
    })
    writeProjectConfig(repoB, {
      theme: { name: "solarized" },
    })

    const configB = loadConfig(repoB)
    expect(configB.theme?.name).toBe("solarized")
    expect(configB.ui).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════
// Filters override: clearing local filters vs non-empty global
// ═══════════════════════════════════════════════════════════════════

describe("filters authoritative locally", () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = makeTempRepo()
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  test("empty local filters override previously-set filters after save+load", () => {
    // Step 1: Write project config with non-empty filters (simulating prior session or global preference)
    writeProjectConfig(repoRoot, {
      ui: { filters: { statuses: ["todo", "in_progress"], readyOnly: true } },
    })
    const before = loadConfig(repoRoot)
    expect(before.ui?.filters?.statuses).toEqual(["todo", "in_progress"])
    expect(before.ui?.filters?.readyOnly).toBe(true)

    // Step 2: Serialize empty filters (user cleared them locally)
    const serialized = serializeUiState({
      currentBoardId: "board-1",
      sortField: "priority",
      previewVisible: false,
      hideSubtasks: false,
      filters: {},
      activeView: "board",
    })

    // The serialized config must include filters key (even empty)
    expect(serialized.filters).toBeDefined()

    // Step 3: Write it as local config (overwrites previous filters)
    saveProjectConfig(repoRoot, { ui: serialized })

    // Step 4: Load merged config — local empty filters should win
    const merged = loadConfig(repoRoot)
    const hydrated = hydrateUiState({
      config: merged.ui,
      availableBoardIds: ["board-1"],
      fallbackBoardId: "board-1",
    })

    // Filters should be empty — previous filters must not leak through
    expect(hydrated.filters).toEqual({})
  })
})

// ═══════════════════════════════════════════════════════════════════
// activeView preserved during transient overlay modes
// ═══════════════════════════════════════════════════════════════════

describe("activeView during transient overlay modes", () => {
  test("serializeUiState preserves activeView when provided (non-transient)", () => {
    const result = serializeUiState({
      currentBoardId: "board-1",
      sortField: "priority",
      previewVisible: false,
      hideSubtasks: false,
      filters: {},
      activeView: "releases",
    })
    expect(result.activeView).toBe("releases")
  })

  test("serializeUiState uses fallback activeView for transient modes", () => {
    // When the caller passes the last known stable view as fallback
    // (simulating what App.tsx does with lastPersistableView ref)
    const lastStableView = "archive"
    const result = serializeUiState({
      currentBoardId: "board-1",
      sortField: "priority",
      previewVisible: false,
      hideSubtasks: false,
      filters: {},
      activeView: lastStableView, // fallback from ref
    })
    expect(result.activeView).toBe("archive")
  })

  test("serializeUiState round-trips activeView through hydration", () => {
    const serialized = serializeUiState({
      currentBoardId: "board-1",
      sortField: "priority",
      previewVisible: false,
      hideSubtasks: false,
      filters: {},
      activeView: "releases",
    })
    const hydrated = hydrateUiState({
      config: serialized,
      availableBoardIds: ["board-1"],
      fallbackBoardId: "board-1",
    })
    expect(hydrated.activeView).toBe("releases")
  })
})
