import { useState, useCallback } from "react"
import { isDbClosed } from "../db/connection.js"
import type { Filters, Status, SortField, TaskCard, Priority } from "../lib/types.js"
import { getTaskCards } from "../db/queries.js"
import { VISIBLE_STATUSES, PRIORITY_ORDER, TASK_TYPE_ORDER, TASK_TYPE_ORDER_NONE } from "../lib/constants.js"
import type { DbError } from "../lib/db-errors.js"
import { classifyDbError } from "../lib/db-errors.js"
import { useDb } from "../lib/db-context.js"

export interface UseBoardResult {
  tasksByStatus: Map<Status, TaskCard[]>
  readyIds: Set<string>
  blockedIds: Set<string>
  dbError: DbError | null
  version: number
  refetch: () => void
}

/**
 * Compare two TaskCards by a given sort field.
 * Returns a negative number if a should come before b, etc.
 */
function compareBySortField(a: TaskCard, b: TaskCard, sortField: SortField): number {
  switch (sortField) {
    case "created":
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    case "updated":
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    case "title":
      return a.title.localeCompare(b.title)
    case "priority":
      return (PRIORITY_ORDER[a.priority as Priority] ?? 99) - (PRIORITY_ORDER[b.priority as Priority] ?? 99)
    default:
      return a.sortOrder - b.sortOrder
  }
}

/**
 * Secondary sort by task type within a sort group.
 * Order: bug (0) > feature (1) > analysis (2) > none (3)
 */
function compareByType(a: TaskCard, b: TaskCard): number {
  const aOrder = a.type ? (TASK_TYPE_ORDER[a.type] ?? TASK_TYPE_ORDER_NONE) : TASK_TYPE_ORDER_NONE
  const bOrder = b.type ? (TASK_TYPE_ORDER[b.type] ?? TASK_TYPE_ORDER_NONE) : TASK_TYPE_ORDER_NONE
  return aOrder - bOrder
}

/**
 * Combined comparator: primary sort by field, secondary by type.
 */
function makeComparator(sortField: SortField) {
  return (a: TaskCard, b: TaskCard): number => {
    const primary = compareBySortField(a, b, sortField)
    if (primary !== 0) return primary
    return compareByType(a, b)
  }
}

/**
 * Sort cards so parent tasks appear first (sorted by the chosen field),
 * followed by their subtasks (also sorted by the same field within their parent).
 * Orphan subtasks (parent in a different status column) are grouped by parent
 * and sorted within each group.
 */
function groupByParent(cards: TaskCard[], sortField?: SortField): TaskCard[] {
  const cmp = sortField ? makeComparator(sortField) : (a: TaskCard, b: TaskCard) => a.sortOrder - b.sortOrder
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
      orphanSubtasks.push(st)
    }
  }

  // Build result: parent followed by its subtasks, then orphan subtasks grouped by parent
  const result: TaskCard[] = []
  for (const parent of parents.sort(cmp)) {
    result.push(parent)
    const children = subtasksByParent.get(parent.id) || []
    result.push(...children.sort(cmp))
  }

  // Group orphan subtasks by parent so siblings appear together
  const orphansByParent = new Map<string, TaskCard[]>()
  for (const ost of orphanSubtasks) {
    const pid = ost.parentId as string
    const list = orphansByParent.get(pid) || []
    list.push(ost)
    orphansByParent.set(pid, list)
  }
  for (const group of orphansByParent.values()) {
    result.push(...group.sort(cmp))
  }

  return result
}

export function useBoard(boardId: string, filters?: Filters, sortField?: SortField): UseBoardResult {
  const db = useDb()
  const [version, setVersion] = useState(0)

  const tasksByStatus = new Map<Status, TaskCard[]>()
  const readyIds = new Set<string>()
  const blockedIds = new Set<string>()
  let dbError: DbError | null = null

  const refetch = useCallback(() => {
    setVersion((v) => v + 1)
  }, [])

  if (boardId) {
    // Guard: skip DB queries if the connection has been closed (e.g., during
    // bun --watch restart). Accessing a closed bun:sqlite handle segfaults.
    if (isDbClosed()) {
      return { tasksByStatus, readyIds, blockedIds, dbError: null, version, refetch }
    }

    try {
      let cards = getTaskCards(db, boardId, {
        includeArchived: filters?.showArchived,
        search: filters?.search,
      })

      // Apply filters before grouping
      if (filters?.statuses?.length) {
        const statuses = filters.statuses
        cards = cards.filter((c) => statuses.includes(c.status))
      }
      if (filters?.priorities?.length) {
        const priorities = filters.priorities
        cards = cards.filter((c) => priorities.includes(c.priority))
      }
      if (filters?.sources?.length) {
        const sources = filters.sources
        cards = cards.filter((c) => sources.includes(c.source))
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
        tasksByStatus.set(status, groupByParent(columnCards, sortField))
      }

      // Collect ready and blocked IDs for badge rendering
      for (const card of cards) {
        if (card.isReady) readyIds.add(card.id)
        if (card.isBlocked) blockedIds.add(card.id)
      }
    } catch (error) {
      dbError = classifyDbError(error)
      // Log unexpected errors — board may not exist yet during initialization,
      // but other errors (corruption, permissions) should be visible
      console.error(
        `[useBoard] Failed to load board (${dbError.kind}): ${dbError.message}`,
      )
    }
  }

  // version is used to force re-renders when refetch is called
  void version

  return { tasksByStatus, readyIds, blockedIds, dbError, version, refetch }
}
