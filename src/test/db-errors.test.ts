import { describe, test, expect } from "bun:test"
import { classifyDbError } from "../lib/db-errors.js"
import type { DbErrorKind } from "../lib/db-errors.js"

describe("classifyDbError", () => {
  test("classifies 'database is locked' as locked", () => {
    const result = classifyDbError(new Error("database is locked"))
    expect(result.kind).toBe("locked")
    expect(result.message).toBe("database is locked")
  })

  test("classifies 'SQLITE_BUSY' as locked", () => {
    const result = classifyDbError(new Error("SQLITE_BUSY: database table is locked"))
    expect(result.kind).toBe("locked")
  })

  test("classifies 'malformed' as corruption", () => {
    const result = classifyDbError(new Error("database disk image is malformed"))
    expect(result.kind).toBe("corruption")
  })

  test("classifies 'corrupt' as corruption", () => {
    const result = classifyDbError(new Error("database file is corrupt"))
    expect(result.kind).toBe("corruption")
  })

  test("classifies 'not a database' as corruption", () => {
    const result = classifyDbError(new Error("file is not a database"))
    expect(result.kind).toBe("corruption")
  })

  test("classifies 'unable to open' as connection", () => {
    const result = classifyDbError(new Error("unable to open database file"))
    expect(result.kind).toBe("connection")
  })

  test("classifies 'ENOENT' as connection", () => {
    const result = classifyDbError(new Error("ENOENT: no such file or directory"))
    expect(result.kind).toBe("connection")
  })

  test("classifies 'EACCES' as connection", () => {
    const result = classifyDbError(new Error("EACCES: permission denied"))
    expect(result.kind).toBe("connection")
  })

  test("classifies 'permission denied' as connection", () => {
    const result = classifyDbError(new Error("permission denied"))
    expect(result.kind).toBe("connection")
  })

  test("classifies 'no such file' as connection", () => {
    const result = classifyDbError(new Error("no such file or directory"))
    expect(result.kind).toBe("connection")
  })

  test("classifies unknown error message as unknown", () => {
    const result = classifyDbError(new Error("something unexpected"))
    expect(result.kind).toBe("unknown")
    expect(result.message).toBe("something unexpected")
  })

  test("handles non-Error input (string)", () => {
    const result = classifyDbError("database is locked")
    expect(result.kind).toBe("locked")
    expect(result.message).toBe("database is locked")
  })

  test("handles non-Error input with unknown message", () => {
    const result = classifyDbError(12345)
    expect(result.kind).toBe("unknown")
    expect(result.message).toBe("12345")
  })

  test("preserves original error message in result", () => {
    const msg = "SQLITE_BUSY: database table is locked (5)"
    const result = classifyDbError(new Error(msg))
    expect(result.message).toBe(msg)
  })
})
