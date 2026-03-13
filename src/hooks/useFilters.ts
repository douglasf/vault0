import { useState, useCallback, useMemo } from "react"
import type { Filters, Status, Priority, Source } from "../lib/types.js"

export interface UseFiltersResult {
  filters: Filters
  toggleStatus: (status: Status) => void
  togglePriority: (priority: Priority) => void
  toggleSource: (source: Source) => void
  toggleTag: (tag: string) => void
  setTagsAll: (tags: string[]) => void
  clearTags: () => void
  toggleReady: () => void
  toggleBlocked: () => void
  toggleArchived: () => void
  setSearch: (term: string) => void
  activeFilterCount: number
  clearFilters: () => void
}

/** Toggle a value in an array — add if absent, remove if present. Returns undefined if result is empty. */
function toggleInArray<T>(arr: T[] | undefined, value: T): T[] | undefined {
  const current = arr ?? []
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value]
  return next.length > 0 ? next : undefined
}

export function useFilters(initialFilters?: Omit<Filters, "search">): UseFiltersResult {
  const [filters, setFilters] = useState<Filters>(() => initialFilters ?? {})

  const toggleStatus = useCallback((status: Status) => {
    setFilters((prev) => ({
      ...prev,
      statuses: toggleInArray(prev.statuses, status),
    }))
  }, [])

  const togglePriority = useCallback((priority: Priority) => {
    setFilters((prev) => ({
      ...prev,
      priorities: toggleInArray(prev.priorities, priority),
    }))
  }, [])

  const toggleSource = useCallback((source: Source) => {
    setFilters((prev) => ({
      ...prev,
      sources: toggleInArray(prev.sources, source),
    }))
  }, [])

  const toggleTag = useCallback((tag: string) => {
    setFilters((prev) => ({
      ...prev,
      tags: toggleInArray(prev.tags, tag),
    }))
  }, [])

  const setTagsAll = useCallback((tags: string[]) => {
    setFilters((prev) => ({
      ...prev,
      tagsAll: tags.length > 0 ? tags : undefined,
    }))
  }, [])

  const clearTags = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      tags: undefined,
      tagsAll: undefined,
    }))
  }, [])

  const toggleReady = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      readyOnly: !prev.readyOnly,
    }))
  }, [])

  const toggleBlocked = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      blockedOnly: !prev.blockedOnly,
    }))
  }, [])

  const toggleArchived = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      showArchived: !prev.showArchived,
    }))
  }, [])

  const setSearch = useCallback((term: string) => {
    setFilters((prev) => ({
      ...prev,
      search: term || undefined,
    }))
  }, [])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.statuses?.length) count += filters.statuses.length
    if (filters.priorities?.length) count += filters.priorities.length
    if (filters.sources?.length) count += filters.sources.length
    if (filters.tags?.length) count += filters.tags.length
    if (filters.tagsAll?.length) count += filters.tagsAll.length
    if (filters.readyOnly) count++
    if (filters.blockedOnly) count++
    if (filters.showArchived) count++
    if (filters.search) count++
    return count
  }, [filters])

  const clearFilters = useCallback(() => {
    setFilters({})
  }, [])

  return {
    filters,
    toggleStatus,
    togglePriority,
    toggleSource,
    toggleTag,
    setTagsAll,
    clearTags,
    toggleReady,
    toggleBlocked,
    toggleArchived,
    setSearch,
    activeFilterCount,
    clearFilters,
  }
}
