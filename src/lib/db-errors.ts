import { errorMessage } from "./format.js"

export type DbErrorKind = "connection" | "corruption" | "locked" | "unknown"

export interface DbError {
  kind: DbErrorKind
  message: string
}

export function classifyDbError(error: unknown): DbError {
  const msg = errorMessage(error)
  const lower = msg.toLowerCase()

  if (lower.includes("database is locked") || lower.includes("sqlite_busy")) {
    return { kind: "locked", message: msg }
  }
  if (
    lower.includes("malformed") ||
    lower.includes("corrupt") ||
    lower.includes("not a database") ||
    lower.includes("disk image is malformed") ||
    lower.includes("database disk image is malformed")
  ) {
    return { kind: "corruption", message: msg }
  }
  if (
    lower.includes("unable to open") ||
    lower.includes("enoent") ||
    lower.includes("eacces") ||
    lower.includes("permission denied") ||
    lower.includes("no such file")
  ) {
    return { kind: "connection", message: msg }
  }
  return { kind: "unknown", message: msg }
}
