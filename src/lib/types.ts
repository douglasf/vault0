import type { InferSelectModel, InferInsertModel } from "drizzle-orm"
import type { boards, tasks, taskDependencies, taskStatusHistory } from "../db/schema.js"

export type Board = InferSelectModel<typeof boards>
export type NewBoard = InferInsertModel<typeof boards>
export type Task = InferSelectModel<typeof tasks>
export type NewTask = InferInsertModel<typeof tasks>
export type TaskDependency = InferSelectModel<typeof taskDependencies>
export type TaskStatusHistoryEntry = InferSelectModel<typeof taskStatusHistory>

export type Status = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled"
export type Priority = "critical" | "high" | "normal" | "low"
export type TaskType = "feature" | "bug" | "analysis"
export type Source = "manual" | "todo_md" | "opencode" | "opencode-plan" | "import"
export type SortField = "created" | "updated" | "title" | "priority"

export type TaskCard = Task & {
  dependencyCount: number
  blockerCount: number
  subtaskTotal: number
  subtaskDone: number
  isReady: boolean
  isBlocked: boolean
  parentTitle?: string
}

export type TaskDetail = Task & {
  subtasks: Task[]
  dependsOn: Task[]
  dependedOnBy: Task[]
  statusHistory: TaskStatusHistoryEntry[]
}

export type Filters = {
  statuses?: Status[]
  priorities?: Priority[]
  sources?: Source[]
  readyOnly?: boolean
  blockedOnly?: boolean
  search?: string
  showArchived?: boolean
}
