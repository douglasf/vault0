import type { Vault0Database } from "../db/connection.js"
import { taskDependencies } from "../db/schema.js"

/**
 * Detect if adding edge (fromTaskId depends on toTaskId) would create a cycle.
 * Uses DFS from 'toTaskId' following its existing dependencies to see if
 * 'fromTaskId' is reachable — if so, adding the edge would create a cycle.
 *
 * Pre-loads all edges in a single query to avoid N+1 per-node SELECTs.
 */
export function wouldCreateCycle(db: Vault0Database, fromTaskId: string, toTaskId: string): boolean {
  if (fromTaskId === toTaskId) return true

  // Single query: load ALL edges
  const allEdges = db.select().from(taskDependencies).all()
  const adjList = new Map<string, string[]>()
  for (const edge of allEdges) {
    const list = adjList.get(edge.taskId) || []
    list.push(edge.dependsOn)
    adjList.set(edge.taskId, list)
  }

  // DFS on in-memory graph
  const visited = new Set<string>()
  function dfs(currentId: string): boolean {
    if (currentId === fromTaskId) return true
    if (visited.has(currentId)) return false
    visited.add(currentId)
    for (const dep of adjList.get(currentId) || []) {
      if (dfs(dep)) return true
    }
    return false
  }
  return dfs(toTaskId)
}
