import { describe, test, expect } from "bun:test"
import {
  getStatusLabel,
  getPriorityLabel,
  getTypeLabel,
  formatDate,
  formatDateTime,
  formatDateISO,
  truncateText,
  errorMessage,
  isResolvedStatus,
} from "../lib/format.js"

describe("getStatusLabel", () => {
  test("returns correct label for all status values", () => {
    expect(getStatusLabel("backlog")).toBe("Backlog")
    expect(getStatusLabel("todo")).toBe("To Do")
    expect(getStatusLabel("in_progress")).toBe("In Progress")
    expect(getStatusLabel("in_review")).toBe("In Review")
    expect(getStatusLabel("done")).toBe("Done")
    expect(getStatusLabel("cancelled")).toBe("Cancelled")
  })

  test("falls back to raw string for unknown values", () => {
    expect(getStatusLabel("unknown_status")).toBe("unknown_status")
    expect(getStatusLabel("")).toBe("")
  })
})

describe("getPriorityLabel", () => {
  test("returns correct label for all priority values", () => {
    expect(getPriorityLabel("critical")).toBe("Critical")
    expect(getPriorityLabel("high")).toBe("High")
    expect(getPriorityLabel("normal")).toBe("Normal")
    expect(getPriorityLabel("low")).toBe("Low")
  })

  test("falls back to raw string for unknown values", () => {
    expect(getPriorityLabel("extreme")).toBe("extreme")
  })
})

describe("getTypeLabel", () => {
  test("returns correct label for all task type values", () => {
    expect(getTypeLabel("feature")).toBe("Feature")
    expect(getTypeLabel("bug")).toBe("Bug")
    expect(getTypeLabel("analysis")).toBe("Analysis")
  })

  test("returns null for null input", () => {
    expect(getTypeLabel(null)).toBeNull()
  })

  test("falls back to raw string for unknown values", () => {
    expect(getTypeLabel("epic")).toBe("epic")
  })
})

describe("formatDate", () => {
  test("formats Date object (locale date string)", () => {
    const d = new Date("2024-01-15T10:30:00Z")
    const result = formatDate(d)
    expect(result).toContain("Jan")
    expect(result).toContain("15")
    expect(result).toContain("2024")
  })

  test("formats string input", () => {
    const result = formatDate("2024-06-01T00:00:00Z")
    expect(result).toContain("Jun")
    expect(result).toContain("2024")
  })

  test("formats number (timestamp) input", () => {
    const ts = new Date("2024-03-10T00:00:00Z").getTime()
    const result = formatDate(ts)
    expect(result).toContain("Mar")
    expect(result).toContain("2024")
  })

  test("returns dash for null (\"—\")", () => {
    expect(formatDate(null)).toBe("—")
  })

  test("returns dash for undefined (\"—\")", () => {
    expect(formatDate(undefined)).toBe("—")
  })
})

describe("formatDateTime", () => {
  test("formats Date object with time", () => {
    const d = new Date("2024-01-15T10:30:00Z")
    const result = formatDateTime(d)
    expect(result).toContain("Jan")
    expect(result).toContain("15")
  })

  test("formats string input with time", () => {
    const result = formatDateTime("2024-06-01T14:00:00Z")
    expect(result).toContain("Jun")
  })

  test("returns dash for null (\"—\")", () => {
    expect(formatDateTime(null)).toBe("—")
  })

  test("returns dash for undefined (\"—\")", () => {
    expect(formatDateTime(undefined)).toBe("—")
  })
})

describe("formatDateISO", () => {
  test("formats Date object as ISO truncated to minute", () => {
    const d = new Date("2024-01-15T10:30:45Z")
    expect(formatDateISO(d)).toBe("2024-01-15T10:30")
  })

  test("returns dash for null (\"—\")", () => {
    expect(formatDateISO(null)).toBe("—")
  })
})

describe("truncateText", () => {
  test("returns unchanged string when length is under max", () => {
    expect(truncateText("hello", 10)).toBe("hello")
  })

  test("returns unchanged string when length equals max (exact boundary)", () => {
    expect(truncateText("hello", 5)).toBe("hello")
  })

  test("truncates with ellipsis when length exceeds max", () => {
    expect(truncateText("hello world", 6)).toBe("hello…")
  })

  test("handles empty string", () => {
    expect(truncateText("", 5)).toBe("")
  })

  test("truncates to single character plus ellipsis (max=2)", () => {
    expect(truncateText("abcdef", 2)).toBe("a…")
  })
})

describe("errorMessage", () => {
  test("extracts message from Error instance", () => {
    expect(errorMessage(new Error("something broke"))).toBe("something broke")
  })

  test("converts string to itself", () => {
    expect(errorMessage("raw string error")).toBe("raw string error")
  })

  test("converts number to string (\"42\")", () => {
    expect(errorMessage(42)).toBe("42")
  })

  test("converts null to string (\"null\")", () => {
    expect(errorMessage(null)).toBe("null")
  })

  test("converts undefined to string (\"undefined\")", () => {
    expect(errorMessage(undefined)).toBe("undefined")
  })
})

describe("isResolvedStatus", () => {
  test("returns true for done", () => {
    expect(isResolvedStatus("done")).toBe(true)
  })

  test("returns true for in_review", () => {
    expect(isResolvedStatus("in_review")).toBe(true)
  })

  test("returns false for backlog", () => {
    expect(isResolvedStatus("backlog")).toBe(false)
  })

  test("returns false for todo", () => {
    expect(isResolvedStatus("todo")).toBe(false)
  })

  test("returns false for in_progress", () => {
    expect(isResolvedStatus("in_progress")).toBe(false)
  })

  test("returns false for cancelled", () => {
    expect(isResolvedStatus("cancelled")).toBe(false)
  })
})
