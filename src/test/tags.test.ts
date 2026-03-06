import { describe, test, expect } from "bun:test"
import { parseTags, formatTags } from "../lib/tags.js"

describe("parseTags", () => {
  test("parses comma-separated tags and trims whitespace", () => {
    expect(parseTags("foo, bar , baz")).toEqual(["foo", "bar", "baz"])
  })

  test("removes empty entries from leading/trailing/double commas", () => {
    expect(parseTags(",foo,,bar,")).toEqual(["foo", "bar"])
  })

  test("deduplicates preserving first-seen order", () => {
    expect(parseTags("a, b, a, c, b")).toEqual(["a", "b", "c"])
  })

  test("empty string returns empty array", () => {
    expect(parseTags("")).toEqual([])
  })

  test("whitespace-only input returns empty array", () => {
    expect(parseTags("  ,  , ")).toEqual([])
  })

  test("single tag returned as single-element array", () => {
    expect(parseTags("solo")).toEqual(["solo"])
  })

  test("preserves case of tags", () => {
    expect(parseTags("Frontend, frontend, FRONTEND")).toEqual(["Frontend", "frontend", "FRONTEND"])
  })

  test("handles tags with special characters", () => {
    expect(parseTags("v1.0, bug-fix, feature_flag")).toEqual(["v1.0", "bug-fix", "feature_flag"])
  })
})

describe("formatTags", () => {
  test("joins tags with comma and space", () => {
    expect(formatTags(["a", "b", "c"])).toBe("a, b, c")
  })

  test("empty array returns empty string", () => {
    expect(formatTags([])).toBe("")
  })

  test("single tag returns tag without separator", () => {
    expect(formatTags(["only"])).toBe("only")
  })

  test("round-trips through parseTags → formatTags → parseTags", () => {
    const input = "  foo , bar, baz , foo "
    const parsed = parseTags(input)
    const formatted = formatTags(parsed)
    const reparsed = parseTags(formatted)
    expect(reparsed).toEqual(["foo", "bar", "baz"])
    expect(reparsed).toEqual(parsed)
  })
})
