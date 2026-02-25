import type { Status, Priority, TaskType } from "./types.js"
import { STATUS_LABELS, PRIORITY_LABELS, TASK_TYPE_LABELS } from "./constants.js"

// ── Label Resolution ────────────────────────────────────────────────

/** Returns the human-readable label for a status value, falling back to the raw string. */
export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status as Status] ?? status
}

/** Returns the human-readable label for a priority value, falling back to the raw string. */
export function getPriorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority as Priority] ?? priority
}

/** Returns the human-readable label for a task type value, or null if the input is null. */
export function getTypeLabel(type: string | null): string | null {
  if (type === null) return null
  return TASK_TYPE_LABELS[type as TaskType] ?? type
}

// ── Date Formatting ─────────────────────────────────────────────────

/** Formats a date as a locale string like "Jan 15, 2024". Returns "—" for null/undefined. */
export function formatDate(date: Date | string | number | null | undefined): string {
  if (!date) return "—"
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

/** Formats a date with time like "Jan 15, 10:30 AM". Returns "—" for null/undefined. */
export function formatDateTime(date: Date | string | number | null | undefined): string {
  if (!date) return "—"
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Formats a date as ISO-truncated to the minute like "2024-01-15T10:30". Returns "—" for null/undefined. */
export function formatDateISO(date: Date | string | number | null | undefined): string {
  if (!date) return "—"
  const d = date instanceof Date ? date : new Date(date)
  return d.toISOString().slice(0, 16)
}

// ── Text Truncation ─────────────────────────────────────────────────

/** Truncates a string to `max` characters, appending unicode ellipsis `…` if needed. */
export function truncateText(str: string, max: number): string {
  if (str.length <= max) return str
  return `${str.slice(0, max - 1)}…`
}

// ── Error Message Extraction ────────────────────────────────────────

/** Extracts a string message from an unknown error value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// ── Status Checks ───────────────────────────────────────────────────

/** Returns true if the status is considered resolved (done or in_review). */
export function isResolvedStatus(status: string): boolean {
  return status === "done" || status === "in_review"
}
