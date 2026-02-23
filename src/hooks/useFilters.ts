import { useState, useCallback, useMemo } from "react"
import type { Filters, Status, Priority, Source } from "../lib/types.js"

export interface UseFiltersResult {
  filters: Filters
  toggleStatus: (status: Status) => void
  togglePriority: (priority: Priority) => void
  toggleSource: (source: Source) => void
  toggleReady: () => void
  toggleBlocked: () => void
  toggleArchived: () => void
  setSearch: (term: string) => void
  activeFilterCount: number
  clearFilters: () => void
}

export function useFilters(): UseFiltersResult {
  const [filters, setFilters] = useState<Filters>({})

  const toggleStatus = useCallback((status: Status) => {
    setFilters((prev) => ({
      ...prev,
      status: prev.status === status ? undefined : status,
    }))
  }, [])

  const togglePriority = useCallback((priority: Priority) => {
    setFilters((prev) => ({
      ...prev,
      priority: prev.priority === priority ? undefined : priority,
    }))
  }, [])

  const toggleSource = useCallback((source: Source) => {
    setFilters((prev) => ({
      ...prev,
      source: prev.source === source ? undefined : source,
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
    if (filters.status) count++
    if (filters.priority) count++
    if (filters.source) count++
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
    toggleReady,
    toggleBlocked,
    toggleArchived,
    setSearch,
    activeFilterCount,
    clearFilters,
  }
}
