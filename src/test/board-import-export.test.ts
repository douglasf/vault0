import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { createTestDb, closeTestDb, type TestDb } from "./helpers.js"
import { createTask, addDependency, archiveTask, getTaskDetail } from "../db/queries.js"
import { tasks, taskDependencies, taskStatusHistory } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { cmdBoardExport, cmdBoardImport } from "../cli/commands.js"
import type { BoardExportEnvelope } from "../lib/types.js"
import { unlinkSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

// ═══════════════════════════════════════════════════════════════════
// Board Export Tests
//
// cmdBoardExport signature: (db, flags, format) => CommandResult
// Exports all non-archived tasks for a board with metadata.
// ═══════════════════════════════════════════════════════════════════

describe("cmdBoardExport", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("exports board with nested tasks", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Parent task",
      description: "Parent desc",
      priority: "high",
      status: "todo",
    })
    createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Child 1",
      parentId: parent.id,
    })
    createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Child 2",
      parentId: parent.id,
    })

    const result = cmdBoardExport(testDb.db, {
      board: testDb.boardId,
    }, "json")

    expect(result.success).toBe(true)
    const envelope: BoardExportEnvelope = JSON.parse(result.message)
    expect(envelope.version).toBe(1)
    expect(envelope.exportedAt).toBeDefined()
    expect(envelope.board).toBeDefined()
    expect(envelope.board.id).toBe(testDb.boardId)

    // Top-level tasks only (children nested inside parent)
    const topLevel = envelope.tasks
    const parentExport = topLevel.find((t) => t.title === "Parent task")
    expect(parentExport).toBeDefined()
    expect(parentExport?.subtasks).toBeDefined()
    expect(parentExport?.subtasks).toHaveLength(2)
    const childTitles = parentExport?.subtasks?.map((s) => s.title) ?? []
    expect(childTitles).toContain("Child 1")
    expect(childTitles).toContain("Child 2")
  })

  test("exports dependencies", () => {
    const taskA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
    })
    const taskB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
    })
    addDependency(testDb.db, taskB.id, taskA.id)

    const result = cmdBoardExport(testDb.db, {
      board: testDb.boardId,
    }, "json")

    expect(result.success).toBe(true)
    const envelope: BoardExportEnvelope = JSON.parse(result.message)
    expect(envelope.dependencies).toBeDefined()
    expect((envelope.dependencies ?? []).length).toBeGreaterThanOrEqual(1)

    const dep = (envelope.dependencies ?? []).find(
      (d) => d.taskId === taskB.id && d.dependsOn === taskA.id,
    )
    expect(dep).toBeDefined()
  })

  test("excludes archived tasks", () => {
    createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Active task",
      status: "todo",
    })
    const archived = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Archived task",
      status: "done",
    })
    archiveTask(testDb.db, archived.id)

    const result = cmdBoardExport(testDb.db, {
      board: testDb.boardId,
    }, "json")

    expect(result.success).toBe(true)
    const envelope: BoardExportEnvelope = JSON.parse(result.message)

    const allTitles = flattenTitles(envelope.tasks)
    expect(allTitles).toContain("Active task")
    expect(allTitles).not.toContain("Archived task")
  })

  test("handles empty board", () => {
    const result = cmdBoardExport(testDb.db, {
      board: testDb.boardId,
    }, "json")

    expect(result.success).toBe(true)
    const envelope: BoardExportEnvelope = JSON.parse(result.message)
    expect(envelope.tasks).toHaveLength(0)
    expect(envelope.board.id).toBe(testDb.boardId)
  })

  test("--out writes file to disk", () => {
    createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "File output test",
    })

    const outPath = join(tmpdir(), `vault0-board-export-${Date.now()}.json`)

    try {
      const result = cmdBoardExport(testDb.db, {
        board: testDb.boardId,
        out: outPath,
      }, "json")

      expect(result.success).toBe(true)
      expect(existsSync(outPath)).toBe(true)

      const fileContent = readFileSync(outPath, "utf-8")
      const envelope: BoardExportEnvelope = JSON.parse(fileContent)
      expect(envelope.tasks).toHaveLength(1)
      expect(envelope.tasks[0].title).toBe("File output test")
    } finally {
      try { unlinkSync(outPath) } catch { /* cleanup */ }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
// Board Import Tests
//
// cmdBoardImport signature: (db, filePath, flags, format) => CommandResult
// Imports a BoardExportEnvelope into the target board.
// ═══════════════════════════════════════════════════════════════════

describe("cmdBoardImport", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  function writeTempJson(data: unknown): string {
    const filePath = join(tmpdir(), `vault0-board-import-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
    writeFileSync(filePath, JSON.stringify(data))
    return filePath
  }

  function cleanupFile(path: string) {
    try { unlinkSync(path) } catch { /* already gone */ }
  }

  test("imported tasks get new ULIDs", () => {
    const envelope: BoardExportEnvelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      board: { id: "01OLDBOARD0000000000000000", name: "Old Board" },
      tasks: [{
        id: "01OLDTASK00000000000000000",
        title: "Imported task",
        description: "desc",
        status: "todo",
        priority: "high",
      }],
    }

    const filePath = writeTempJson(envelope)
    try {
      const result = cmdBoardImport(testDb.db, filePath, {}, "json")
      expect(result.success).toBe(true)

      const allTasks = testDb.db.select().from(tasks).all()
      const imported = allTasks.find((t) => t.title === "Imported task")
      expect(imported).toBeDefined()
      expect(imported?.id).not.toBe("01OLDTASK00000000000000000")
      expect(imported?.description).toBe("desc")
      expect(imported?.status).toBe("todo")
      expect(imported?.priority).toBe("high")
    } finally {
      cleanupFile(filePath)
    }
  })

  test("parent-child relationships preserved", () => {
    const envelope: BoardExportEnvelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      board: { id: "01OLDBOARD0000000000000000", name: "Old Board" },
      tasks: [{
        id: "01PARENT00000000000000000000",
        title: "Parent",
        status: "todo",
        priority: "normal",
        subtasks: [
          { id: "01CHILD0000000000000000001", title: "Child 1", status: "backlog", priority: "normal" },
          { id: "01CHILD0000000000000000002", title: "Child 2", status: "backlog", priority: "normal" },
        ],
      }],
    }

    const filePath = writeTempJson(envelope)
    try {
      const result = cmdBoardImport(testDb.db, filePath, {}, "json")
      expect(result.success).toBe(true)

      const allTasks = testDb.db.select().from(tasks).all()
      const parent = allTasks.find((t) => t.title === "Parent")
      const child1 = allTasks.find((t) => t.title === "Child 1")
      const child2 = allTasks.find((t) => t.title === "Child 2")

      expect(parent).toBeDefined()
      expect(child1).toBeDefined()
      expect(child2).toBeDefined()

      expect(child1?.parentId).toBe(parent?.id)
      expect(child2?.parentId).toBe(parent?.id)

      // All IDs should be new
      expect(parent?.id).not.toBe("01PARENT00000000000000000000")
      expect(child1?.id).not.toBe("01CHILD0000000000000000001")
      expect(child2?.id).not.toBe("01CHILD0000000000000000002")
    } finally {
      cleanupFile(filePath)
    }
  })

  test("dependencies remapped correctly", () => {
    const envelope: BoardExportEnvelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      board: { id: "01OLDBOARD0000000000000000", name: "Old Board" },
      tasks: [
        { id: "01DEPA00000000000000000000", title: "Dep Task A", status: "backlog", priority: "normal" },
        { id: "01DEPB00000000000000000000", title: "Dep Task B", status: "backlog", priority: "normal" },
      ],
      dependencies: [
        { taskId: "01DEPB00000000000000000000", dependsOn: "01DEPA00000000000000000000" },
      ],
    }

    const filePath = writeTempJson(envelope)
    try {
      const result = cmdBoardImport(testDb.db, filePath, {}, "json")
      expect(result.success).toBe(true)

      const allTasks = testDb.db.select().from(tasks).all()
      const taskA = allTasks.find((t) => t.title === "Dep Task A")
      const taskB = allTasks.find((t) => t.title === "Dep Task B")
      expect(taskA).toBeDefined()
      expect(taskB).toBeDefined()

      if (taskB) {
        const detail = getTaskDetail(testDb.db, taskB.id)
        expect(detail.dependsOn.length).toBe(1)
        if (taskA) {
          expect(detail.dependsOn[0].id).toBe(taskA.id)
        }
      }
    } finally {
      cleanupFile(filePath)
    }
  })

  test("source set to import on imported tasks", () => {
    const envelope: BoardExportEnvelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      board: { id: "01OLDBOARD0000000000000000", name: "Old Board" },
      tasks: [{
        id: "01SOURCE000000000000000000",
        title: "Source check",
        status: "backlog",
        priority: "normal",
        source: "opencode",
      }],
    }

    const filePath = writeTempJson(envelope)
    try {
      const result = cmdBoardImport(testDb.db, filePath, {}, "json")
      expect(result.success).toBe(true)

      const allTasks = testDb.db.select().from(tasks).all()
      const imported = allTasks.find((t) => t.title === "Source check")
      expect(imported).toBeDefined()
      expect(imported?.source).toBe("import")
    } finally {
      cleanupFile(filePath)
    }
  })

  test("atomic rollback on error (invalid task in batch)", () => {
    const taskCountBefore = testDb.db.select().from(tasks).all().length

    const envelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      board: { id: "01OLDBOARD0000000000000000", name: "Old Board" },
      tasks: [
        { id: "01VALID00000000000000000000", title: "Valid task", status: "backlog", priority: "normal" },
        { id: "01INVALID000000000000000000", title: "", status: "invalid_status", priority: "normal" },
      ],
    }

    const filePath = writeTempJson(envelope)
    try {
      const result = cmdBoardImport(testDb.db, filePath, {}, "json")
      expect(result.success).toBe(false)

      // No new tasks should exist (rolled back)
      const taskCountAfter = testDb.db.select().from(tasks).all().length
      expect(taskCountAfter).toBe(taskCountBefore)
    } finally {
      cleanupFile(filePath)
    }
  })

  test("error on invalid JSON file", () => {
    const filePath = join(tmpdir(), `vault0-board-bad-json-${Date.now()}.json`)
    writeFileSync(filePath, "this is not valid json {{{")

    try {
      const result = cmdBoardImport(testDb.db, filePath, {}, "json")
      expect(result.success).toBe(false)
      expect(result.message).toMatch(/invalid|parse|json/i)
    } finally {
      try { unlinkSync(filePath) } catch { /* cleanup */ }
    }
  })

  test("error on missing file", () => {
    const result = cmdBoardImport(testDb.db, "/nonexistent/path/to/file.json", {}, "json")
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/not found|no such file|does not exist/i)
  })

  test("error on wrong version", () => {
    const envelope = {
      version: 999,
      exportedAt: new Date().toISOString(),
      board: { id: "01OLDBOARD0000000000000000", name: "Old Board" },
      tasks: [],
    }

    const filePath = writeTempJson(envelope)
    try {
      const result = cmdBoardImport(testDb.db, filePath, {}, "json")
      expect(result.success).toBe(false)
      expect(result.message).toMatch(/version/i)
    } finally {
      cleanupFile(filePath)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
// Round-trip: Board Export → Import → Re-export
// ═══════════════════════════════════════════════════════════════════

describe("board export/import round-trip", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("export then import then re-export produces equivalent data (ignoring IDs and timestamps)", () => {
    // Set up a board with parent/child tasks and a dependency
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Round-trip parent",
      description: "Parent description",
      priority: "high",
      status: "in_progress",
    })
    createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Round-trip child",
      description: "Child description",
      parentId: parent.id,
    })
    const independentA = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Independent A",
      status: "todo",
    })
    const independentB = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Independent B",
      status: "todo",
    })
    addDependency(testDb.db, independentB.id, independentA.id)

    // First export
    const exportResult1 = cmdBoardExport(testDb.db, {
      board: testDb.boardId,
    }, "json")
    expect(exportResult1.success).toBe(true)
    const envelope1: BoardExportEnvelope = JSON.parse(exportResult1.message)

    // Import into a fresh DB
    const testDb2 = createTestDb()
    const filePath = join(tmpdir(), `vault0-board-roundtrip-${Date.now()}.json`)
    writeFileSync(filePath, exportResult1.message)

    try {
      const importResult = cmdBoardImport(testDb2.db, filePath, {}, "json")
      expect(importResult.success).toBe(true)

      // Re-export from the second DB
      const exportResult2 = cmdBoardExport(testDb2.db, {
        board: testDb2.boardId,
      }, "json")
      expect(exportResult2.success).toBe(true)
      const envelope2: BoardExportEnvelope = JSON.parse(exportResult2.message)

      // Compare structure ignoring IDs and timestamps
      const normalized1 = normalizeEnvelope(envelope1)
      const normalized2 = normalizeEnvelope(envelope2)

      expect(normalized2.tasks.length).toBe(normalized1.tasks.length)

      // All titles should be present
      const titles1 = normalized1.tasks.map((t) => t.title).sort()
      const titles2 = normalized2.tasks.map((t) => t.title).sort()
      expect(titles2).toEqual(titles1)

      // Dependency count should match
      expect(normalized2.dependencyCount).toBe(normalized1.dependencyCount)

      // Verify parent-child structure preserved
      const parentExport2 = envelope2.tasks.find((t) => t.title === "Round-trip parent")
      expect(parentExport2?.subtasks).toHaveLength(1)
      expect(parentExport2?.subtasks?.[0].title).toBe("Round-trip child")
    } finally {
      closeTestDb(testDb2.sqlite)
      try { unlinkSync(filePath) } catch { /* cleanup */ }
    }
  })
})

// ── Helpers ──────────────────────────────────────────────────────

/** Recursively collect all task titles from an exported task array */
function flattenTitles(exportedTasks: BoardExportEnvelope["tasks"]): string[] {
  const titles: string[] = []
  for (const t of exportedTasks) {
    titles.push(t.title)
    if (t.subtasks) {
      titles.push(...flattenTitles(t.subtasks))
    }
  }
  return titles
}

/** Strip IDs and timestamps for structural comparison */
function normalizeEnvelope(envelope: BoardExportEnvelope) {
  return {
    tasks: normalizeTaskList(envelope.tasks),
    dependencyCount: (envelope.dependencies ?? []).length,
  }
}

function normalizeTaskList(exportedTasks: BoardExportEnvelope["tasks"]): Array<{ title: string; subtaskCount: number }> {
  return exportedTasks.map((t) => ({
    title: t.title,
    subtaskCount: t.subtasks?.length ?? 0,
  })).sort((a, b) => a.title.localeCompare(b.title))
}
