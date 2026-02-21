import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { ulid } from "ulidx"

// ── Boards ──────────────────────────────────────────────────────────

export const boards = sqliteTable("boards", {
  id: text("id").primaryKey().$defaultFn(() => ulid()),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
})

// ── Tasks ───────────────────────────────────────────────────────────

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey().$defaultFn(() => ulid()),
  boardId: text("board_id").notNull().references(() => boards.id),
  parentId: text("parent_id").references(() => tasks.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"],
  }).notNull().default("backlog"),
  priority: text("priority", {
    enum: ["critical", "high", "normal", "low"],
  }).notNull().default("normal"),
  type: text("type", {
    enum: ["feature", "bug", "analysis"],
  }),
  source: text("source", {
    enum: ["manual", "todo_md", "opencode", "opencode-plan", "import"],
  }).notNull().default("manual"),
  sourceRef: text("source_ref"),
  tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
}, (table) => [
  index("idx_tasks_board_status").on(table.boardId, table.status),
  index("idx_tasks_parent").on(table.parentId),
  index("idx_tasks_priority").on(table.priority),
  index("idx_tasks_source").on(table.source),
])

// ── Task Dependencies ───────────────────────────────────────────────

export const taskDependencies = sqliteTable("task_dependencies", {
  taskId: text("task_id").notNull().references(() => tasks.id),
  dependsOn: text("depends_on").notNull().references(() => tasks.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  primaryKey({ columns: [table.taskId, table.dependsOn] }),
])

// ── Task Status History ─────────────────────────────────────────────

export const taskStatusHistory = sqliteTable("task_status_history", {
  id: text("id").primaryKey().$defaultFn(() => ulid()),
  taskId: text("task_id").notNull().references(() => tasks.id),
  fromStatus: text("from_status", {
    enum: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"],
  }),
  toStatus: text("to_status", {
    enum: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"],
  }).notNull(),
  changedAt: integer("changed_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("idx_status_history_task").on(table.taskId),
  index("idx_status_history_changed").on(table.changedAt),
])

// ── Relations ───────────────────────────────────────────────────────

export const boardsRelations = relations(boards, ({ many }) => ({
  tasks: many(tasks),
}))

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  board: one(boards, { fields: [tasks.boardId], references: [boards.id] }),
  parent: one(tasks, { fields: [tasks.parentId], references: [tasks.id], relationName: "subtasks" }),
  subtasks: many(tasks, { relationName: "subtasks" }),
  dependsOn: many(taskDependencies, { relationName: "taskDeps" }),
  dependedOnBy: many(taskDependencies, { relationName: "reverseDeps" }),
  statusHistory: many(taskStatusHistory),
}))

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(tasks, { fields: [taskDependencies.taskId], references: [tasks.id], relationName: "taskDeps" }),
  dependency: one(tasks, { fields: [taskDependencies.dependsOn], references: [tasks.id], relationName: "reverseDeps" }),
}))

export const taskStatusHistoryRelations = relations(taskStatusHistory, ({ one }) => ({
  task: one(tasks, { fields: [taskStatusHistory.taskId], references: [tasks.id] }),
}))
