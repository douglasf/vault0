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

/**
 * Sort cards so parent tasks appear first, followed by their subtasks.
 * Within each group (parent + children), sortOrder is respected.
 * Orphan subtasks (parent in a different status column) sort by their own sortOrder.
 */
function groupByParent(cards: TaskCard[]): TaskCard[] {
  const parents = cards.filter((c) => c.parentId === null)
  const subtasks = cards.filter((c) => c.parentId !== null)

  // Index subtasks by parentId for fast lookup
  const subtasksByParent = new Map<string, TaskCard[]>()
  const orphanSubtasks: TaskCard[] = []

  for (const st of subtasks) {
    const pid = st.parentId as string
    const parentInColumn = parents.find((p) => p.id === pid)
    if (parentInColumn) {
      const list = subtasksByParent.get(pid) || []
      list.push(st)
      subtasksByParent.set(pid, list)
    } else {
      // Parent is in a different column — subtask appears independently
      orphanSubtasks.push(st)
    }
  }

  // Build result: parent followed by its subtasks, then orphan subtasks
  const result: TaskCard[] = []
  for (const parent of parents.sort((a, b) => a.sortOrder - b.sortOrder)) {
    result.push(parent)
    const children = subtasksByParent.get(parent.id) || []
    result.push(...children.sort((a, b) => a.sortOrder - b.sortOrder))
  }
  result.push(...orphanSubtasks.sort((a, b) => a.sortOrder - b.sortOrder))

  return result
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

      // Group cards by status, with parent-child grouping within each column
      for (const status of VISIBLE_STATUSES) {
        const columnCards = cards.filter((c) => c.status === status)
        tasksByStatus.set(status, groupByParent(columnCards))
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
