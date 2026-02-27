import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { createTestDb, closeTestDb, type TestDb } from "./helpers.js"
import { createTask, addDependency, archiveTask, getTaskDetail } from "../db/queries.js"
import { tasks, taskStatusHistory } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { parseArgs } from "../cli/index.js"
import { cmdTaskExport, cmdTaskImport } from "../cli/commands.js"
import type { TaskExportEnvelope } from "../lib/types.js"
import { unlinkSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

// ═══════════════════════════════════════════════════════════════════
// Parser Tests — multi-value --task-id and --include-subtasks
// ═══════════════════════════════════════════════════════════════════

describe("parseArgs multi-value and boolean flags for export/import", () => {
  test("repeated --task-id parsed correctly (comma-joined)", () => {
    const result = parseArgs(["--task-id", "ABC", "--task-id", "DEF"])
    expect(result.flags["task-id"]).toBe("ABC,DEF")
  })

  test("single --task-id parsed as single value", () => {
    const result = parseArgs(["--task-id", "ABC"])
    expect(result.flags["task-id"]).toBe("ABC")
  })

  test("three repeated --task-id values", () => {
    const result = parseArgs(["--task-id", "A", "--task-id", "B", "--task-id", "C"])
    expect(result.flags["task-id"]).toBe("A,B,C")
  })

  test("--task-id with other flags interspersed", () => {
    const result = parseArgs(["--task-id", "ABC", "--format", "json", "--task-id", "DEF"])
    expect(result.flags["task-id"]).toBe("ABC,DEF")
    expect(result.format).toBe("json")
  })

  test("--include-subtasks boolean parsed without value", () => {
    const result = parseArgs(["--include-subtasks"])
    expect(result.flags["include-subtasks"]).toBe("true")
  })

  test("--include-subtasks followed by another flag defaults to true", () => {
    const result = parseArgs(["--include-subtasks", "--format", "json"])
    expect(result.flags["include-subtasks"]).toBe("true")
    expect(result.format).toBe("json")
  })

  test("--include-subtasks with --task-id combined", () => {
    const result = parseArgs(["--task-id", "ABC", "--include-subtasks", "--task-id", "DEF"])
    expect(result.flags["task-id"]).toBe("ABC,DEF")
    expect(result.flags["include-subtasks"]).toBe("true")
  })
})

// ═══════════════════════════════════════════════════════════════════
// Export Tests — JSON format
//
// cmdTaskExport signature: (db, flags, format) => CommandResult
// Matches the pattern used by cmdList/cmdAdd.
// ═══════════════════════════════════════════════════════════════════

describe("cmdTaskExport JSON", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("exports single task as JSON envelope", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Export me",
      description: "Some description",
      priority: "high",
      status: "todo",
    })

    const result = cmdTaskExport(testDb.db, {
      "task-id": task.id,
    }, "json")

    expect(result.success).toBe(true)
    const envelope: TaskExportEnvelope = JSON.parse(result.message)
    expect(envelope.version).toBe(1)
    expect(envelope.exportedAt).toBeDefined()
    expect(envelope.tasks).toHaveLength(1)
    expect(envelope.tasks[0].id).toBe(task.id)
    expect(envelope.tasks[0].title).toBe("Export me")
    expect(envelope.tasks[0].description).toBe("Some description")
    expect(envelope.tasks[0].priority).toBe("high")
    expect(envelope.tasks[0].status).toBe("todo")
  })

  test("exports multiple tasks with repeated --task-id", () => {
    const task1 = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "First task",
    })
    const task2 = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Second task",
    })

    const result = cmdTaskExport(testDb.db, {
      "task-id": `${task1.id},${task2.id}`,
    }, "json")

    expect(result.success).toBe(true)
    const envelope: TaskExportEnvelope = JSON.parse(result.message)
    expect(envelope.tasks).toHaveLength(2)
    const titles = envelope.tasks.map((t) => t.title)
    expect(titles).toContain("First task")
    expect(titles).toContain("Second task")
  })

  test("exports with --include-subtasks nests children", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Parent task",
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

    const result = cmdTaskExport(testDb.db, {
      "task-id": parent.id,
      "include-subtasks": "true",
    }, "json")

    expect(result.success).toBe(true)
    const envelope: TaskExportEnvelope = JSON.parse(result.message)
    expect(envelope.tasks).toHaveLength(1)
    const exported = envelope.tasks[0]
    expect(exported.title).toBe("Parent task")
    expect(exported.subtasks).toBeDefined()
    expect(exported.subtasks).toHaveLength(2)
    const childTitles = exported.subtasks?.map((s) => s.title) ?? []
    expect(childTitles).toContain("Child 1")
    expect(childTitles).toContain("Child 2")
  })

  test("excludes archived tasks when exporting all", () => {
    const task1 = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Active task",
      status: "done",
    })
    const task2 = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Archived task",
      status: "done",
    })
    archiveTask(testDb.db, task2.id)

    // Export all (no --task-id specified)
    const result = cmdTaskExport(testDb.db, {}, "json")

    expect(result.success).toBe(true)
    const envelope: TaskExportEnvelope = JSON.parse(result.message)
    const titles = envelope.tasks.map((t) => t.title)
    expect(titles).toContain("Active task")
    expect(titles).not.toContain("Archived task")
  })

  test("exports multiple tasks with dependencies present", () => {
    const task1 = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task A",
    })
    const task2 = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Task B",
    })
    addDependency(testDb.db, task2.id, task1.id)

    const result = cmdTaskExport(testDb.db, {
      "task-id": `${task1.id},${task2.id}`,
    }, "json")

    expect(result.success).toBe(true)
    const envelope: TaskExportEnvelope = JSON.parse(result.message)
    expect(envelope.tasks).toHaveLength(2)
    const titles = envelope.tasks.map((t) => t.title)
    expect(titles).toContain("Task A")
    expect(titles).toContain("Task B")
  })

  test("--out writes file to disk", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "File output test",
    })

    const outPath = join(tmpdir(), `vault0-test-export-${Date.now()}.json`)

    try {
      const result = cmdTaskExport(testDb.db, {
        "task-id": task.id,
        out: outPath,
      }, "json")

      expect(result.success).toBe(true)
      expect(existsSync(outPath)).toBe(true)

      const fileContent = readFileSync(outPath, "utf-8")
      const envelope: TaskExportEnvelope = JSON.parse(fileContent)
      expect(envelope.tasks).toHaveLength(1)
      expect(envelope.tasks[0].title).toBe("File output test")
    } finally {
      try { unlinkSync(outPath) } catch { /* cleanup */ }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
// Export Tests — Markdown format
// ═══════════════════════════════════════════════════════════════════

describe("cmdTaskExport Markdown", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("markdown export single task shows title, description, solution", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "My Task",
      description: "Task description here",
    })
    testDb.db.update(tasks).set({ solution: "The solution" }).where(eq(tasks.id, task.id)).run()

    const result = cmdTaskExport(testDb.db, {
      "task-id": task.id,
      "export-format": "markdown",
    }, "text")

    expect(result.success).toBe(true)
    expect(result.message).toContain("# My Task")
    expect(result.message).toContain("Task description here")
    expect(result.message).toContain("The solution")
  })

  test("markdown export with subtasks shows hierarchical headers", () => {
    const parent = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Parent Task",
      description: "Parent desc",
    })
    createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Child Task",
      description: "Child desc",
      parentId: parent.id,
    })

    const result = cmdTaskExport(testDb.db, {
      "task-id": parent.id,
      "include-subtasks": "true",
      "export-format": "markdown",
    }, "text")

    expect(result.success).toBe(true)
    expect(result.message).toContain("# Parent Task")
    expect(result.message).toContain("## Child Task")
    expect(result.message).toContain("Parent desc")
    expect(result.message).toContain("Child desc")
  })

  test("markdown export multiple tasks in one document", () => {
    const task1 = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "First Document Task",
      description: "First desc",
    })
    const task2 = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Second Document Task",
      description: "Second desc",
    })

    const result = cmdTaskExport(testDb.db, {
      "task-id": `${task1.id},${task2.id}`,
      "export-format": "markdown",
    }, "text")

    expect(result.success).toBe(true)
    expect(result.message).toContain("# First Document Task")
    expect(result.message).toContain("# Second Document Task")
    expect(result.message).toContain("First desc")
    expect(result.message).toContain("Second desc")
  })

  test("markdown --out writes file to disk", () => {
    const task = createTask(testDb.db, {
      boardId: testDb.boardId,
      title: "Markdown File Test",
      description: "Some markdown content",
    })

    const outPath = join(tmpdir(), `vault0-test-export-${Date.now()}.md`)

    try {
      const result = cmdTaskExport(testDb.db, {
        "task-id": task.id,
        "export-format": "markdown",
        out: outPath,
      }, "text")

      expect(result.success).toBe(true)
      expect(existsSync(outPath)).toBe(true)
    } finally {
      try { unlinkSync(outPath) } catch { /* cleanup */ }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
// Import Tests
//
// cmdTaskImport signature: (db, filePath, flags, format) => CommandResult
// filePath is a string (first positional arg extracted by the action wrapper).
// ═══════════════════════════════════════════════════════════════════

describe("cmdTaskImport", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  function writeTempJson(data: unknown): string {
    const filePath = join(tmpdir(), `vault0-test-import-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
    writeFileSync(filePath, JSON.stringify(data))
    return filePath
  }

  function cleanupFile(path: string) {
    try { unlinkSync(path) } catch { /* already gone */ }
  }

  test("imports single task with new ULID", () => {
    const envelope: TaskExportEnvelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: [{
        id: "01OLDTASKID0000000000000000",
        title: "Imported task",
        description: "Imported desc",
        status: "todo",
        priority: "high",
      }],
    }

    const filePath = writeTempJson(envelope)
    try {
      const result = cmdTaskImport(testDb.db, filePath, {}, "json")
      expect(result.success).toBe(true)

      const data = JSON.parse(result.message)
      expect(data.taskCount).toBe(1)

      // Verify task exists with new ULID
      const allTasks = testDb.db.select().from(tasks).all()
      const imported = allTasks.find((t) => t.title === "Imported task")
      expect(imported).toBeDefined()
      expect(imported?.id).not.toBe("01OLDTASKID0000000000000000")
      expect(imported?.description).toBe("Imported desc")
      expect(imported?.status).toBe("todo")
      expect(imported?.priority).toBe("high")
    } finally {
      cleanupFile(filePath)
    }
  })

  test("imports array of tasks", () => {
    const envelope: TaskExportEnvelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: [
        { id: "01AAA000000000000000000001", title: "Task A", status: "backlog", priority: "normal" },
        { id: "01AAA000000000000000000002", title: "Task B", status: "todo", priority: "high" },
        { id: "01AAA000000000000000000003", title: "Task C", status: "in_progress", priority: "critical" },
      ],
    }

    const filePath = writeTempJson(envelope)
    try {
      const result = cmdTaskImport(testDb.db, filePath, {}, "json")
      expect(result.success).toBe(true)

      const data = JSON.parse(result.message)
      expect(data.taskCount).toBe(3)

      const allTasks = testDb.db.select().from(tasks).all()
      const importedTitles = allTasks.map((t) => t.title)
      expect(importedTitles).toContain("Task A")
      expect(importedTitles).toContain("Task B")
      expect(importedTitles).toContain("Task C")
    } finally {
      cleanupFile(filePath)
    }
  })

  test("imports nested subtasks with correct parentId", () => {
    const envelope: TaskExportEnvelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
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
      const result = cmdTaskImport(testDb.db, filePath, {}, "json")
      expect(result.success).toBe(true)

      const allTasks = testDb.db.select().from(tasks).all()
      const parent = allTasks.find((t) => t.title === "Parent")
      const child1 = allTasks.find((t) => t.title === "Child 1")
      const child2 = allTasks.find((t) => t.title === "Child 2")

      expect(parent).toBeDefined()
      expect(child1).toBeDefined()
      expect(child2).toBeDefined()

      // Children should have new ULIDs and point to the new parent ID
      expect(child1?.parentId).toBe(parent?.id)
      expect(child2?.parentId).toBe(parent?.id)

      // All IDs should be new (different from original)
      expect(parent?.id).not.toBe("01PARENT00000000000000000000")
      expect(child1?.id).not.toBe("01CHILD0000000000000000001")
      expect(child2?.id).not.toBe("01CHILD0000000000000000002")
    } finally {
      cleanupFile(filePath)
    }
  })

  test("sets source=import on imported tasks", () => {
    const envelope: TaskExportEnvelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
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
      const result = cmdTaskImport(testDb.db, filePath, {}, "json")
      expect(result.success).toBe(true)

      const allTasks = testDb.db.select().from(tasks).all()
      const imported = allTasks.find((t) => t.title === "Source check")
      expect(imported).toBeDefined()
      expect(imported?.source).toBe("import")
    } finally {
      cleanupFile(filePath)
    }
  })

  test("records status history for imported tasks", () => {
    const envelope: TaskExportEnvelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: [{
        id: "01HISTORY0000000000000000000",
        title: "History check",
        status: "todo",
        priority: "normal",
      }],
    }

    const filePath = writeTempJson(envelope)
    try {
      const result = cmdTaskImport(testDb.db, filePath, {}, "json")
      expect(result.success).toBe(true)

      const allTasks = testDb.db.select().from(tasks).all()
      const imported = allTasks.find((t) => t.title === "History check")
      expect(imported).toBeDefined()

      if (imported) {
        const history = testDb.db
          .select()
          .from(taskStatusHistory)
          .where(eq(taskStatusHistory.taskId, imported.id))
          .all()
        expect(history.length).toBeGreaterThanOrEqual(1)
      }
    } finally {
      cleanupFile(filePath)
    }
  })

  test("imports dependencies with remapped IDs", () => {
    const envelope: TaskExportEnvelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
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
      const result = cmdTaskImport(testDb.db, filePath, {}, "json")
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

  test("atomic rollback on error (invalid task in batch)", () => {
    const taskCountBefore = testDb.db.select().from(tasks).all().length

    const envelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: [
        { id: "01VALID00000000000000000000", title: "Valid task", status: "backlog", priority: "normal" },
        { id: "01INVALID000000000000000000", title: "", status: "invalid_status", priority: "normal" },
      ],
    }

    const filePath = writeTempJson(envelope)
    try {
      const result = cmdTaskImport(testDb.db, filePath, {}, "json")
      expect(result.success).toBe(false)

      // No new tasks should exist (rolled back)
      const taskCountAfter = testDb.db.select().from(tasks).all().length
      expect(taskCountAfter).toBe(taskCountBefore)
    } finally {
      cleanupFile(filePath)
    }
  })

  test("error on invalid JSON file", () => {
    const filePath = join(tmpdir(), `vault0-test-bad-json-${Date.now()}.json`)
    writeFileSync(filePath, "this is not valid json {{{")

    try {
      const result = cmdTaskImport(testDb.db, filePath, {}, "json")
      expect(result.success).toBe(false)
      expect(result.message).toMatch(/invalid|parse|json/i)
    } finally {
      try { unlinkSync(filePath) } catch { /* cleanup */ }
    }
  })

  test("error on missing file", () => {
    const result = cmdTaskImport(testDb.db, "/nonexistent/path/to/file.json", {}, "json")
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/not found|no such file|does not exist/i)
  })

  test("error when no file argument provided", () => {
    const result = cmdTaskImport(testDb.db, "", {}, "json")
    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Round-trip: Export → Import
// ═══════════════════════════════════════════════════════════════════

describe("export/import round-trip", () => {
  let testDb: TestDb

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    closeTestDb(testDb.sqlite)
  })

  test("exported JSON can be re-imported with preserved structure", () => {
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

    // Export
    const exportResult = cmdTaskExport(testDb.db, {
      "task-id": parent.id,
      "include-subtasks": "true",
    }, "json")
    expect(exportResult.success).toBe(true)

    // Write to temp file
    const filePath = join(tmpdir(), `vault0-roundtrip-${Date.now()}.json`)
    writeFileSync(filePath, exportResult.message)

    try {
      // Import into same DB (will create duplicates with new IDs)
      const importResult = cmdTaskImport(testDb.db, filePath, {}, "json")
      expect(importResult.success).toBe(true)

      // Verify we now have both original and imported
      const allTasks = testDb.db.select().from(tasks).all()
      const roundTripParents = allTasks.filter((t) => t.title === "Round-trip parent")
      expect(roundTripParents).toHaveLength(2)

      // The imported one should have a different ID and source=import
      const importedParent = roundTripParents.find((t) => t.id !== parent.id)
      expect(importedParent).toBeDefined()
      expect(importedParent?.description).toBe("Parent description")
      expect(importedParent?.source).toBe("import")

      // The imported child should reference the new parent
      const roundTripChildren = allTasks.filter((t) => t.title === "Round-trip child")
      expect(roundTripChildren).toHaveLength(2)
      if (importedParent) {
        const importedChild = roundTripChildren.find((t) => t.parentId === importedParent.id)
        expect(importedChild).toBeDefined()
      }
    } finally {
      try { unlinkSync(filePath) } catch { /* cleanup */ }
    }
  })
})
