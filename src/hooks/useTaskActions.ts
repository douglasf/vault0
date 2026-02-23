import { useCallback } from "react"
import type { Vault0Database } from "../db/connection.js"
import type { Status, Priority, TaskType } from "../lib/types.js"
import { createTask, updateTask, updateTaskStatus, archiveTask, unarchiveTask, archiveDoneTasks } from "../db/queries.js"
import { tasks } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { recordTaskCreated, recordStatusChange } from "../lib/session-stats.js"

export interface UseTaskActionsResult {
  createNewTask: (boardId: string, title: string, description?: string, priority?: Priority, parentId?: string, status?: Status, type?: TaskType | null) => ReturnType<typeof createTask>
  updateTaskData: (taskId: string, title: string, description: string, priority: Priority, type?: TaskType | null) => ReturnType<typeof updateTask>
  updateStatus: (taskId: string, newStatus: Status) => void
  cyclePriority: (taskId: string) => void
  deleteTask: (taskId: string) => void
  undeleteTask: (taskId: string) => void
  archiveDoneLane: (boardId: string) => number
}

export function useTaskActions(db: Vault0Database): UseTaskActionsResult {
  const createNewTask = useCallback(
    (boardId: string, title: string, description?: string, priority?: Priority, parentId?: string, status?: Status, type?: TaskType | null) => {
      const result = createTask(db, {
        boardId,
        title,
        description,
        priority: priority || "normal",
        type: type ?? undefined,
        parentId,
        status,
      })
      recordTaskCreated()
      return result
    },
    [db],
  )

  const updateTaskData = useCallback(
    (taskId: string, title: string, description: string, priority: Priority, type?: TaskType | null) => {
      return updateTask(db, taskId, {
        title,
        description,
        priority,
        type: type !== undefined ? type : undefined,
      })
    },
    [db],
  )

  const updateStatus = useCallback(
    (taskId: string, newStatus: Status) => {
      updateTaskStatus(db, taskId, newStatus)
      recordStatusChange(newStatus)
    },
    [db],
  )

  const cyclePriority = useCallback(
    (taskId: string) => {
      const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()
      if (task) {
        const priorities: Priority[] = ["normal", "high", "critical", "low"]
        const currentIndex = priorities.indexOf(task.priority as Priority)
        const nextPriority = priorities[(currentIndex + 1) % priorities.length]
        updateTask(db, taskId, { priority: nextPriority })
      }
    },
    [db],
  )

  const deleteTask = useCallback(
    (taskId: string) => {
      archiveTask(db, taskId)
    },
    [db],
  )

  const undeleteTask = useCallback(
    (taskId: string) => {
      unarchiveTask(db, taskId)
    },
    [db],
  )

  const archiveDoneLane = useCallback(
    (boardId: string) => {
      return archiveDoneTasks(db, boardId)
    },
    [db],
  )

  return {
    createNewTask,
    updateTaskData,
    updateStatus,
    cyclePriority,
    deleteTask,
    undeleteTask,
    archiveDoneLane,
  }
}
