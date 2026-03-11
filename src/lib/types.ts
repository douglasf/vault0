import type { InferSelectModel, InferInsertModel } from "drizzle-orm"
import type { boards, tasks, taskDependencies, taskStatusHistory, releases } from "../db/schema.js"

export type Board = InferSelectModel<typeof boards>
export type NewBoard = InferInsertModel<typeof boards>
export type Task = InferSelectModel<typeof tasks>
export type NewTask = InferInsertModel<typeof tasks>
export type TaskDependency = InferSelectModel<typeof taskDependencies>
export type TaskStatusHistoryEntry = InferSelectModel<typeof taskStatusHistory>
export type Release = InferSelectModel<typeof releases>
export type NewRelease = InferInsertModel<typeof releases>

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
  tags?: string[]
  tagsAll?: string[]
  readyOnly?: boolean
  blockedOnly?: boolean
  search?: string
  showArchived?: boolean
}

export type VersionInfo = {
  file: string
  oldVersion: string
  newVersion: string
}

export type ReleaseWithTaskCount = Release & {
  taskCount: number
}

// ── Export/Import Types ─────────────────────────────────────────────

/** A task as it appears in an export JSON file */
export type ExportedTask = {
  id: string
  title: string
  description?: string | null
  status: Status
  priority: Priority
  type?: TaskType | null
  source?: Source | null
  sourceRef?: string | null
  tags?: string[]
  solution?: string | null
  sortOrder?: number
  createdAt?: string
  updatedAt?: string
  subtasks?: ExportedTask[]
}

/** A dependency as it appears in an export JSON file */
export type ExportedDependency = {
  taskId: string
  dependsOn: string
}

/** Envelope for task-level export/import */
export type TaskExportEnvelope = {
  version: number
  exportedAt: string
  tasks: ExportedTask[]
  dependencies?: ExportedDependency[]
}

/** Envelope for board-level export/import */
export type BoardExportEnvelope = {
  version: number
  exportedAt: string
  board: { id: string; name: string; description?: string | null }
  tasks: ExportedTask[]
  dependencies?: ExportedDependency[]
}
