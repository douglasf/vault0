// ── Session Statistics Tracker ──────────────────────────────────────
// Module-level state that tracks user actions during a TUI session.
// Imported by useTaskActions to record events, and by the exit screen
// to render a summary.

export interface SessionStats {
  startedAt: number
  tasksCreated: number
  tasksDone: number
}

const stats: SessionStats = {
  startedAt: Date.now(),
  tasksCreated: 0,
  tasksDone: 0,
}

export function recordTaskCreated(): void {
  stats.tasksCreated++
}

export function recordStatusChange(newStatus: string): void {
  if (newStatus === "done") stats.tasksDone++
}

export function getSessionStats(): Readonly<SessionStats> {
  return stats
}
