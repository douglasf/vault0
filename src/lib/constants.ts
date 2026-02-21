import type { Status, Priority, TaskType } from "./types.js"

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

// Column configuration
export const COLUMNS = VISIBLE_STATUSES.map((status) => ({
  status,
  label: STATUS_LABELS[status],
}))
