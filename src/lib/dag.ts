import type { Vault0Database } from "../db/connection.js"
import { taskDependencies } from "../db/schema.js"
import { eq } from "drizzle-orm"
import type { Task } from "./types.js"

/**
 * Detect if adding edge (fromTaskId depends on toTaskId) would create a cycle.
 * Uses DFS from 'toTaskId' following its existing dependencies to see if
 * 'fromTaskId' is reachable — if so, adding the edge would create a cycle.
 */
export function wouldCreateCycle(db: Vault0Database, fromTaskId: string, toTaskId: string): boolean {
  // Self-dependency is always a cycle
  if (fromTaskId === toTaskId) return true

  const visited = new Set<string>()

  function dfs(currentId: string): boolean {
    if (currentId === fromTaskId) return true
    if (visited.has(currentId)) return false

    visited.add(currentId)

    const deps = db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.taskId, currentId))
      .all()

    for (const dep of deps) {
      if (dfs(dep.dependsOn)) return true
    }

    return false
  }

  return dfs(toTaskId)
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns tasks in dependency-respecting execution order.
 * Tasks with no dependencies come first.
 */
export function topologicalSort(
  taskList: Task[],
  dependencies: Array<{ taskId: string; dependsOn: string }>,
): Task[] {
  const idMap = new Map(taskList.map((t) => [t.id, t]))
  const inDegree = new Map(taskList.map((t) => [t.id, 0]))
  const adjList = new Map<string, string[]>()

  // Build adjacency list: dependsOn → taskId (edge goes from dependency to dependent)
  for (const t of taskList) {
    adjList.set(t.id, [])
  }

  for (const d of dependencies) {
    if (idMap.has(d.dependsOn) && idMap.has(d.taskId)) {
      const neighbors = adjList.get(d.dependsOn)
      if (neighbors) neighbors.push(d.taskId)
      inDegree.set(d.taskId, (inDegree.get(d.taskId) ?? 0) + 1)
    }
  }

  // Kahn's algorithm: start with nodes that have no incoming edges
  const queue: string[] = []
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(id)
  }

  const result: Task[] = []

  while (queue.length > 0) {
    const current = queue.shift() as string
    const task = idMap.get(current)
    if (task) result.push(task)

    const neighbors = adjList.get(current) ?? []
    for (const neighbor of neighbors) {
      inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) - 1)
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor)
      }
    }
  }

  return result
}

/**
 * Get all transitive dependencies of a task (full upstream chain).
 * Returns the IDs of all tasks that must be completed before this task.
 */
export function getTransitiveDependencies(db: Vault0Database, taskId: string): string[] {
  const visited = new Set<string>()
  const result: string[] = []

  function dfs(current: string) {
    if (visited.has(current)) return
    visited.add(current)

    const deps = db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.taskId, current))
      .all()

    for (const d of deps) {
      result.push(d.dependsOn)
      dfs(d.dependsOn)
    }
  }

  dfs(taskId)
  return result
}

/**
 * Get all transitive dependents of a task (full downstream chain).
 * Returns the IDs of all tasks that are blocked (directly or indirectly) by this task.
 */
export function getTransitiveDependents(db: Vault0Database, taskId: string): string[] {
  const visited = new Set<string>()
  const result: string[] = []

  function dfs(current: string) {
    if (visited.has(current)) return
    visited.add(current)

    const dependents = db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.dependsOn, current))
      .all()

    for (const d of dependents) {
      result.push(d.taskId)
      dfs(d.taskId)
    }
  }

  dfs(taskId)
  return result
}
