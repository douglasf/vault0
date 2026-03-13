import type { SortField, Filters, Status, Priority, Source } from "./types.js"
import type { UiConfig } from "./config.js"
import { UI_CONFIG_DEFAULTS } from "./config.js"
import { SORT_FIELDS } from "./constants.js"

// ── Persistable View ────────────────────────────────────────────────────

/**
 * Coarse top-level views that can be restored across sessions.
 * Modal/detail/form/help states are transient and always start clean.
 */
export type PersistableView = "board" | "releases" | "archive"

const PERSISTABLE_VIEWS: ReadonlySet<string> = new Set<PersistableView>(["board", "releases", "archive"])

/** Check whether a string is a valid persistable view */
export function isPersistableView(value: unknown): value is PersistableView {
  return typeof value === "string" && PERSISTABLE_VIEWS.has(value)
}

// ── Valid Enum Sets ─────────────────────────────────────────────────────

const VALID_SORT_FIELDS: ReadonlySet<string> = new Set<SortField>(SORT_FIELDS)
const VALID_STATUSES: ReadonlySet<string> = new Set<Status>(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"])
const VALID_PRIORITIES: ReadonlySet<string> = new Set<Priority>(["critical", "high", "normal", "low"])
const VALID_SOURCES: ReadonlySet<string> = new Set<Source>(["manual", "todo_md", "opencode", "opencode-plan", "import"])

// ── Hydrated UI State ───────────────────────────────────────────────────

/**
 * Fully resolved runtime UI state hydrated from config.
 * All fields have concrete values (no undefineds for required fields).
 * Transient state (modals, detail selection, help, navigation cursor) is excluded.
 */
export interface HydratedUiState {
  currentBoardId: string
  sortField: SortField
  previewVisible: boolean
  hideSubtasks: boolean
  filters: Omit<Filters, "search">
  activeView: PersistableView
}

// ── Filter Sanitization ─────────────────────────────────────────────────

/** Filter an array to only include strings. Returns undefined if empty. */
function filterStringArray(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) return undefined
  const filtered = values.filter((v): v is string => typeof v === "string" && v.length > 0)
  return filtered.length > 0 ? filtered : undefined
}

/** Filter an array to only include values in the valid set. Returns undefined if empty. */
function filterValid<T extends string>(values: unknown, validSet: ReadonlySet<string>): T[] | undefined {
  if (!Array.isArray(values)) return undefined
  const filtered = values.filter((v): v is T => typeof v === "string" && validSet.has(v))
  return filtered.length > 0 ? filtered : undefined
}

/**
 * Sanitize persisted filter values, dropping any invalid enum values.
 * Returns a clean Filters object (without `search`, which is transient).
 */
export function sanitizeFilters(raw: unknown): Omit<Filters, "search"> {
  if (!raw || typeof raw !== "object") return {}
  const f = raw as Record<string, unknown>
  const result: Omit<Filters, "search"> = {}

  const statuses = filterValid<Status>(f.statuses, VALID_STATUSES)
  if (statuses) result.statuses = statuses

  const priorities = filterValid<Priority>(f.priorities, VALID_PRIORITIES)
  if (priorities) result.priorities = priorities

  const sources = filterValid<Source>(f.sources, VALID_SOURCES)
  if (sources) result.sources = sources

  const tags = filterStringArray(f.tags)
  if (tags) result.tags = tags

  const tagsAll = filterStringArray(f.tagsAll)
  if (tagsAll) result.tagsAll = tagsAll

  if (typeof f.readyOnly === "boolean") result.readyOnly = f.readyOnly
  if (typeof f.blockedOnly === "boolean") result.blockedOnly = f.blockedOnly
  if (typeof f.showArchived === "boolean") result.showArchived = f.showArchived

  return result
}

// ── Hydration ───────────────────────────────────────────────────────────

export interface HydrateOptions {
  /** Merged UiConfig from config file */
  config?: UiConfig
  /** Available board IDs to validate currentBoardId against */
  availableBoardIds: string[]
  /** Fallback board ID if config board is invalid (typically the first board) */
  fallbackBoardId: string
}

/**
 * Hydrate runtime UI state from merged config.
 * Validates all values and falls back to defaults for anything invalid.
 * Transient state is excluded — callers initialize that separately.
 */
export function hydrateUiState(opts: HydrateOptions): HydratedUiState {
  const { config, availableBoardIds, fallbackBoardId } = opts
  const ui = config ?? {}

  // Board ID: must exist in available boards
  const boardSet = new Set(availableBoardIds)
  const currentBoardId = (typeof ui.currentBoardId === "string" && boardSet.has(ui.currentBoardId))
    ? ui.currentBoardId
    : fallbackBoardId

  // Sort field: must be a valid sort field
  const sortField: SortField = (typeof ui.sortField === "string" && VALID_SORT_FIELDS.has(ui.sortField))
    ? ui.sortField as SortField
    : UI_CONFIG_DEFAULTS.sortField

  // Booleans: must be actual booleans
  const previewVisible = typeof ui.previewVisible === "boolean" ? ui.previewVisible : UI_CONFIG_DEFAULTS.previewVisible
  const hideSubtasks = typeof ui.hideSubtasks === "boolean" ? ui.hideSubtasks : UI_CONFIG_DEFAULTS.hideSubtasks

  // Filters: sanitize
  const filters = sanitizeFilters(ui.filters)

  // Active view: restore from config if valid, otherwise default to board
  const activeView: PersistableView = isPersistableView(ui.activeView) ? ui.activeView : "board"

  return {
    currentBoardId,
    sortField,
    previewVisible,
    hideSubtasks,
    filters,
    activeView,
  }
}

// ── Serialization (runtime → config) ────────────────────────────────────

export interface SerializeUiStateInput {
  currentBoardId: string
  sortField: SortField
  previewVisible: boolean
  hideSubtasks: boolean
  filters: Omit<Filters, "search">
  activeView?: PersistableView
}

/**
 * Convert runtime UI state to a UiConfig for persistence.
 * The result can be passed directly to `pruneDefaultUi` → `saveProjectConfig`.
 * Search is explicitly excluded (transient).
 */
export function serializeUiState(state: SerializeUiStateInput): UiConfig {
  const result: UiConfig = {}

  if (state.currentBoardId) result.currentBoardId = state.currentBoardId
  result.sortField = state.sortField
  result.previewVisible = state.previewVisible
  result.hideSubtasks = state.hideSubtasks
  if (state.activeView) result.activeView = state.activeView

  // Always include filters — even empty {} — so local config explicitly
  // overrides global filters (otherwise global filters leak through merge)
  const { search: _search, ...persistableFilters } = state.filters as Filters
  result.filters = persistableFilters

  return result
}
