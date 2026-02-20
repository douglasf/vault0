import { useState, useCallback } from "react"
import type { Vault0Database } from "../db/connection.js"
import type { Filters, Status, TaskCard } from "../lib/types.js"
import { getTaskCards } from "../db/queries.js"
import { VISIBLE_STATUSES } from "../lib/constants.js"

export interface UseBoardResult {
  tasksByStatus: Map<Status, TaskCard[]>
  readyIds: Set<string>
  blockedIds: Set<string>
  version: number
  refetch: () => void
}

export function useBoard(db: Vault0Database, boardId: string, filters?: Filters): UseBoardResult {
  const [version, setVersion] = useState(0)

  const tasksByStatus = new Map<Status, TaskCard[]>()
  const readyIds = new Set<string>()
  const blockedIds = new Set<string>()

  if (boardId) {
    try {
      let cards = getTaskCards(db, boardId)

      // Apply filters before grouping
      if (filters?.status) {
        cards = cards.filter((c) => c.status === filters.status)
      }
      if (filters?.priority) {
        cards = cards.filter((c) => c.priority === filters.priority)
      }
      if (filters?.source) {
        cards = cards.filter((c) => c.source === filters.source)
      }
      if (filters?.search) {
        const term = filters.search.toLowerCase()
        cards = cards.filter((c) => c.title.toLowerCase().includes(term))
      }
      if (filters?.readyOnly) {
        cards = cards.filter((c) => c.isReady)
      }
      if (filters?.blockedOnly) {
        cards = cards.filter((c) => c.isBlocked)
      }

      // Group cards by status, sorted by sortOrder within each group
      for (const status of VISIBLE_STATUSES) {
        tasksByStatus.set(
          status,
          cards.filter((c) => c.status === status).sort((a, b) => a.sortOrder - b.sortOrder)
        )
      }

      // Collect ready and blocked IDs for badge rendering
      for (const card of cards) {
        if (card.isReady) readyIds.add(card.id)
        if (card.isBlocked) blockedIds.add(card.id)
      }
    } catch {
      // Silently fail — board may not exist yet during initialization
    }
  }

  const refetch = useCallback(() => {
    setVersion((v) => v + 1)
  }, [])

  // version is used to force re-renders when refetch is called
  void version

  return { tasksByStatus, readyIds, blockedIds, version, refetch }
}
