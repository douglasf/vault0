import { useCallback } from "react"
import type { Vault0Database } from "../db/connection.js"
import type { Status, Priority } from "../lib/types.js"
import { createTask, updateTask, updateTaskStatus, archiveTask } from "../db/queries.js"
import { tasks } from "../db/schema.js"
import { eq } from "drizzle-orm"

export interface UseTaskActionsResult {
  createNewTask: (boardId: string, title: string, description?: string, priority?: Priority, parentId?: string) => ReturnType<typeof createTask>
  updateTaskData: (taskId: string, title: string, description: string, priority: Priority) => ReturnType<typeof updateTask>
  updateStatus: (taskId: string, newStatus: Status) => void
  cyclePriority: (taskId: string) => void
  deleteTask: (taskId: string) => void
}

export function useTaskActions(db: Vault0Database): UseTaskActionsResult {
  const createNewTask = useCallback(
    (boardId: string, title: string, description?: string, priority?: Priority, parentId?: string) => {
      return createTask(db, {
        boardId,
        title,
        description,
        priority: priority || "normal",
        parentId,
      })
    },
    [db],
  )

  const updateTaskData = useCallback(
    (taskId: string, title: string, description: string, priority: Priority) => {
      return updateTask(db, taskId, {
        title,
        description,
        priority,
      })
    },
    [db],
  )

  const updateStatus = useCallback(
    (taskId: string, newStatus: Status) => {
      updateTaskStatus(db, taskId, newStatus)
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

  return {
    createNewTask,
    updateTaskData,
    updateStatus,
    cyclePriority,
    deleteTask,
  }
}
