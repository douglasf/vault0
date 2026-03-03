import type { Status, Priority, TaskType, SortField } from "./types.js"

/**
 * Statuses shown as board columns in the TUI kanban view.
 * "cancelled" is intentionally excluded — cancelled tasks are hidden from the board.
 * They remain in the database and are visible via `vault0 task list` (CLI).
 * To see all tasks including cancelled: `vault0 task list --status cancelled`
 */
export const VISIBLE_STATUSES: Status[] = ["backlog", "todo", "in_progress", "in_review", "done"]

export const STATUS_LABELS: Record<Status, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  cancelled: "Cancelled",
}

export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
}

export const TASK_TYPES: TaskType[] = ["feature", "bug", "analysis"]

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  feature: "Feature",
  bug: "Bug",
  analysis: "Analysis",
}

/** Subtle single-character indicators for task types shown on the board */
export const TASK_TYPE_INDICATORS: Record<TaskType, string> = {
  feature: "✦",
  bug: "▪",
  analysis: "◇",
}

/** Sort order for task types within a sort group (lower = higher priority) */
export const TASK_TYPE_ORDER: Record<string, number> = {
  bug: 0,
  feature: 1,
  analysis: 2,
}
export const TASK_TYPE_ORDER_NONE = 3

export const SORT_FIELDS: SortField[] = ["priority", "created", "updated", "title"]

export const SORT_FIELD_LABELS: Record<SortField, string> = {
  created: "Created",
  updated: "Updated",
  title: "Title",
  priority: "Priority",
}

