import type { Task, TaskCard, TaskDetail, TaskType, Board } from "../lib/types.js"
import { TASK_TYPE_INDICATORS } from "../lib/constants.js"
import { getStatusLabel, getPriorityLabel, getTypeLabel, truncateText, formatDateISO, isResolvedStatus } from "../lib/format.js"

// ── Output Mode ─────────────────────────────────────────────────────

export type OutputFormat = "json" | "text"

// ── JSON Output ─────────────────────────────────────────────────────

export function jsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2)
}

// ── Text Formatters ─────────────────────────────────────────────────

function priorityIcon(priority: string): string {
  switch (priority) {
    case "critical": return "🔴"
    case "high": return "🟡"
    case "normal": return "⚪"
    case "low": return "⚫"
    default: return "⚪"
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case "backlog": return "📋"
    case "todo": return "📌"
    case "in_progress": return "🔧"
    case "in_review": return "🔍"
    case "done": return "✅"
    case "cancelled": return "❌"
    default: return "📋"
  }
}

function pad(str: string, len: number): string {
  return str.padEnd(len)
}

// ── Task Formatters ─────────────────────────────────────────────────

export function formatTaskRow(task: Task | TaskCard): string {
  const id = task.id.slice(-8)
  const pri = priorityIcon(task.priority)
  const st = statusIcon(task.status)
  const statusLabel = pad(getStatusLabel(task.status), 12)
  const isSubtask = task.parentId !== null
  const prefix = isSubtask ? "  → " : ""
  const typeIndicator = task.type ? ` ${TASK_TYPE_INDICATORS[task.type as TaskType] || ""}` : ""
  const titleMax = isSubtask ? 46 : 50
  const title = truncateText(task.title, titleMax)

  let extras = ""
  if ("isBlocked" in task && task.isBlocked) extras += " [BLOCKED]"
  if ("subtaskTotal" in task && task.subtaskTotal > 0) {
    extras += ` [${task.subtaskDone}/${task.subtaskTotal} subtasks]`
  }
  if ("parentTitle" in task && task.parentTitle) {
    extras += ` (↳ ${truncateText(task.parentTitle as string, 20)})`
  }

  return `${id}  ${pri} ${st} ${statusLabel}  ${prefix}${title}${typeIndicator}${extras}`
}

export function formatTaskList(tasks: (Task | TaskCard)[]): string {
  if (tasks.length === 0) return "No tasks found."

  const header = `${"ID".padEnd(10)}${"".padEnd(5)}${"Status".padEnd(14)}Title`
  const separator = "─".repeat(80)

  // Sort: parents first (by sortOrder), then their subtasks immediately after
  const parents = tasks.filter((t) => t.parentId === null)
  const subtasks = tasks.filter((t) => t.parentId !== null)
  const subtasksByParent = new Map<string, (Task | TaskCard)[]>()
  const orphanSubtasks: (Task | TaskCard)[] = []

  for (const st of subtasks) {
    const parentInList = parents.find((p) => p.id === st.parentId)
    if (parentInList) {
      const list = subtasksByParent.get(st.parentId as string) || []
      list.push(st)
      subtasksByParent.set(st.parentId as string, list)
    } else {
      orphanSubtasks.push(st)
    }
  }

  const ordered: (Task | TaskCard)[] = []
  for (const parent of parents) {
    ordered.push(parent)
    const children = subtasksByParent.get(parent.id) || []
    ordered.push(...children)
  }
  ordered.push(...orphanSubtasks)

  const rows = ordered.map(formatTaskRow)
  return [header, separator, ...rows, separator, `${tasks.length} task(s)`].join("\n")
}

export function formatTaskDetail(detail: TaskDetail): string {
  const lines: string[] = []

  lines.push(`╔${"═".repeat(78)}╗`)
  lines.push(`║  Task: ${detail.title.padEnd(68)}║`)
  lines.push(`╠${"═".repeat(78)}╣`)
  lines.push(`║  ID:       ${detail.id.padEnd(64)}║`)
  lines.push(`║  Status:   ${statusIcon(detail.status)} ${(getStatusLabel(detail.status)).padEnd(61)}║`)
  lines.push(`║  Priority: ${priorityIcon(detail.priority)} ${(getPriorityLabel(detail.priority)).padEnd(61)}║`)
  if (detail.type) {
    const typeLabel = getTypeLabel(detail.type) ?? detail.type
    const typeIcon = TASK_TYPE_INDICATORS[detail.type as TaskType] || ""
    lines.push(`║  Type:     ${typeIcon} ${typeLabel.padEnd(62)}║`)
  }
  lines.push(`║  Source:   ${(detail.source || "manual").padEnd(64)}║`)

  if (detail.parentId) {
    lines.push(`║  Parent:   ↳ [${detail.parentId.slice(-8)}]${"".padEnd(55)}║`)
  }

  if (detail.tags && detail.tags.length > 0) {
    lines.push(`║  Tags:     ${detail.tags.join(", ").padEnd(64)}║`)
  }

  if (detail.description) {
    lines.push(`╠${"─".repeat(78)}╣`)
    lines.push(`║  Description:${"".padEnd(63)}║`)
    const descLines = detail.description.split("\n")
    for (const dl of descLines) {
      lines.push(`║    ${truncateText(dl, 72).padEnd(74)}║`)
    }
  }

  if (detail.subtasks.length > 0) {
    lines.push(`╠${"─".repeat(78)}╣`)
    lines.push(`║  Subtasks (${detail.subtasks.length}):${"".padEnd(60 - String(detail.subtasks.length).length)}║`)
    for (const st of detail.subtasks) {
      const done = st.status === "done" ? "✓" : "○"
      lines.push(`║    ${done} ${truncateText(st.title, 68).padEnd(71)}║`)
    }
  }

  if (detail.dependsOn.length > 0) {
    lines.push(`╠${"─".repeat(78)}╣`)
    lines.push(`║  Depends On (${detail.dependsOn.length}):${"".padEnd(58 - String(detail.dependsOn.length).length)}║`)
    for (const dep of detail.dependsOn) {
      const done = isResolvedStatus(dep.status) ? "✓" : "○"
      lines.push(`║    ${done} [${dep.id.slice(-8)}] ${truncateText(dep.title, 58).padEnd(61)}║`)
    }
  }

  if (detail.dependedOnBy.length > 0) {
    lines.push(`╠${"─".repeat(78)}╣`)
    lines.push(`║  Blocking (${detail.dependedOnBy.length}):${"".padEnd(60 - String(detail.dependedOnBy.length).length)}║`)
    for (const dep of detail.dependedOnBy) {
      lines.push(`║    [${dep.id.slice(-8)}] ${truncateText(dep.title, 62).padEnd(65)}║`)
    }
  }

  if (detail.statusHistory.length > 0) {
    lines.push(`╠${"─".repeat(78)}╣`)
    lines.push(`║  Status History:${"".padEnd(60)}║`)
    for (const h of detail.statusHistory.slice(0, 10)) {
      const from = h.fromStatus ? getStatusLabel(h.fromStatus) : "—"
      const to = getStatusLabel(h.toStatus)
      const date = formatDateISO(h.changedAt)
      lines.push(`║    ${date}  ${from} → ${to}${"".padEnd(Math.max(0, 74 - 4 - 16 - 2 - from.length - 3 - to.length))}║`)
    }
  }

  const created = formatDateISO(detail.createdAt)
  const updated = formatDateISO(detail.updatedAt)

  lines.push(`╠${"─".repeat(78)}╣`)
  lines.push(`║  Created: ${created.padEnd(65)}║`)
  lines.push(`║  Updated: ${updated.padEnd(65)}║`)
  lines.push(`╚${"═".repeat(78)}╝`)

  return lines.join("\n")
}

export function formatBoard(board: Board): string {
  return `[${board.id.slice(-8)}] ${board.name}${board.description ? ` — ${board.description}` : ""}`
}

export function formatSuccess(message: string): string {
  return `✓ ${message}`
}

export function formatError(message: string): string {
  return `✗ ${message}`
}
