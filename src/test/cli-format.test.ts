import { describe, test, expect } from "bun:test"
import {
  formatTaskRow,
  formatTaskList,
  formatTaskDetail,
  jsonOutput,
  formatSuccess,
  formatError,
} from "../cli/format.js"
import type { Task, TaskCard, TaskDetail, TaskStatusHistoryEntry } from "../lib/types.js"

// ═══════════════════════════════════════════════════════════════════
// Mock Factories
// ═══════════════════════════════════════════════════════════════════

const BOARD_ID = "01AABBCCDD0000000000000000"
const now = new Date("2026-02-21T12:00:00.000Z")

function mockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "01AABBCCDD1111111122223333",
    boardId: BOARD_ID,
    parentId: null,
    title: "Test task",
    description: null,
    status: "todo",
    priority: "normal",
    type: null,
    source: "manual",
    sourceRef: null,
    tags: [],
    releaseId: null,
    solution: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...overrides,
  }
}

function mockTaskCard(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    ...mockTask(),
    dependencyCount: 0,
    blockerCount: 0,
    subtaskTotal: 0,
    subtaskDone: 0,
    isReady: true,
    isBlocked: false,
    ...overrides,
  } as TaskCard
}

function mockTaskDetail(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    ...mockTask(),
    subtasks: [],
    dependsOn: [],
    dependedOnBy: [],
    statusHistory: [],
    ...overrides,
  } as TaskDetail
}

function mockHistoryEntry(overrides: Partial<TaskStatusHistoryEntry> = {}): TaskStatusHistoryEntry {
  return {
    id: "01HIST000000000000000000AA",
    taskId: "01AABBCCDD1111111122223333",
    fromStatus: null,
    toStatus: "backlog",
    changedAt: now,
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════════
// formatTaskRow
// ═══════════════════════════════════════════════════════════════════

describe("formatTaskRow", () => {
  // ── Task ID truncation ─────────────────────────────────────────

  describe("task ID truncation", () => {
    test("includes last 8 chars of task ID", () => {
      const task = mockTask({ id: "01AABBCCDD1111111122223333" })
      const row = formatTaskRow(task)
      expect(row).toContain("22223333")
    })

    test("does not include full ID", () => {
      const task = mockTask({ id: "01AABBCCDD1111111122223333" })
      const row = formatTaskRow(task)
      expect(row).not.toContain("01AABBCCDD1111111122223333")
    })

    test("short IDs still show last 8 chars", () => {
      const task = mockTask({ id: "ABCD1234" })
      const row = formatTaskRow(task)
      expect(row).toContain("ABCD1234")
    })
  })

  // ── Priority icons ────────────────────────────────────────────

  describe("priority icons", () => {
    test("critical shows 🔴", () => {
      const task = mockTask({ priority: "critical" })
      expect(formatTaskRow(task)).toContain("🔴")
    })

    test("high shows 🟡", () => {
      const task = mockTask({ priority: "high" })
      expect(formatTaskRow(task)).toContain("🟡")
    })

    test("normal shows ⚪", () => {
      const task = mockTask({ priority: "normal" })
      expect(formatTaskRow(task)).toContain("⚪")
    })

    test("low shows ⚫", () => {
      const task = mockTask({ priority: "low" })
      expect(formatTaskRow(task)).toContain("⚫")
    })
  })

  // ── Status icons ──────────────────────────────────────────────

  describe("status icons", () => {
    test("backlog shows 📋", () => {
      const task = mockTask({ status: "backlog" })
      expect(formatTaskRow(task)).toContain("📋")
    })

    test("todo shows 📌", () => {
      const task = mockTask({ status: "todo" })
      expect(formatTaskRow(task)).toContain("📌")
    })

    test("in_progress shows 🔧", () => {
      const task = mockTask({ status: "in_progress" })
      expect(formatTaskRow(task)).toContain("🔧")
    })

    test("in_review shows 🔍", () => {
      const task = mockTask({ status: "in_review" })
      expect(formatTaskRow(task)).toContain("🔍")
    })

    test("done shows ✅", () => {
      const task = mockTask({ status: "done" })
      expect(formatTaskRow(task)).toContain("✅")
    })

    test("cancelled shows ❌", () => {
      const task = mockTask({ status: "cancelled" })
      expect(formatTaskRow(task)).toContain("❌")
    })
  })

  // ── BLOCKED indicator ─────────────────────────────────────────

  describe("blocked indicator", () => {
    test("shows [BLOCKED] for blocked TaskCards", () => {
      const card = mockTaskCard({ isBlocked: true })
      expect(formatTaskRow(card)).toContain("[BLOCKED]")
    })

    test("does not show [BLOCKED] for non-blocked TaskCards", () => {
      const card = mockTaskCard({ isBlocked: false })
      expect(formatTaskRow(card)).not.toContain("[BLOCKED]")
    })

    test("does not show [BLOCKED] for plain Tasks (no isBlocked field)", () => {
      const task = mockTask()
      expect(formatTaskRow(task)).not.toContain("[BLOCKED]")
    })
  })

  // ── Subtask counts ────────────────────────────────────────────

  describe("subtask counts", () => {
    test("shows subtask count for parent TaskCards", () => {
      const card = mockTaskCard({ subtaskTotal: 5, subtaskDone: 2 })
      expect(formatTaskRow(card)).toContain("[2/5 subtasks]")
    })

    test("does not show subtask count when subtaskTotal is 0", () => {
      const card = mockTaskCard({ subtaskTotal: 0, subtaskDone: 0 })
      expect(formatTaskRow(card)).not.toContain("subtasks")
    })

    test("shows 0/N when no subtasks done", () => {
      const card = mockTaskCard({ subtaskTotal: 3, subtaskDone: 0 })
      expect(formatTaskRow(card)).toContain("[0/3 subtasks]")
    })

    test("shows N/N when all subtasks done", () => {
      const card = mockTaskCard({ subtaskTotal: 4, subtaskDone: 4 })
      expect(formatTaskRow(card)).toContain("[4/4 subtasks]")
    })
  })

  // ── Parent title for subtasks ─────────────────────────────────

  describe("parent title for subtasks", () => {
    test("shows parent title with ↳ prefix for subtask TaskCards", () => {
      const card = mockTaskCard({
        parentId: "01PARENT0000000000000000AA",
        parentTitle: "Parent Task",
      })
      expect(formatTaskRow(card)).toContain("(↳ Parent Task)")
    })

    test("truncates long parent titles", () => {
      const card = mockTaskCard({
        parentId: "01PARENT0000000000000000AA",
        parentTitle: "A very long parent task title that exceeds twenty characters",
      })
      const row = formatTaskRow(card)
      expect(row).toContain("↳")
      // The parent title is truncated to 20 chars
      expect(row).not.toContain("A very long parent task title that exceeds twenty characters")
    })

    test("does not show parent title for top-level tasks", () => {
      const card = mockTaskCard({ parentId: null })
      expect(formatTaskRow(card)).not.toContain("↳")
    })
  })

  // ── Subtask prefix (→) ────────────────────────────────────────

  describe("subtask row prefix", () => {
    test("subtasks get → prefix in their row", () => {
      const task = mockTask({ parentId: "01PARENT0000000000000000AA" })
      expect(formatTaskRow(task)).toContain("→")
    })

    test("top-level tasks do not get → prefix", () => {
      const task = mockTask({ parentId: null })
      expect(formatTaskRow(task)).not.toContain("→")
    })
  })

  // ── Title truncation ──────────────────────────────────────────

  describe("title truncation", () => {
    test("short titles are displayed in full", () => {
      const task = mockTask({ title: "Short title" })
      expect(formatTaskRow(task)).toContain("Short title")
    })

    test("long titles for top-level tasks are truncated with …", () => {
      const longTitle = "A".repeat(60)
      const task = mockTask({ title: longTitle })
      const row = formatTaskRow(task)
      // Top-level title max is 50 chars; truncated at 49 + …
      expect(row).toContain("…")
      expect(row).not.toContain(longTitle)
    })

    test("subtask titles have smaller max length", () => {
      const longTitle = "B".repeat(55)
      const task = mockTask({
        title: longTitle,
        parentId: "01PARENT0000000000000000AA",
      })
      const row = formatTaskRow(task)
      // Subtask title max is 46 chars
      expect(row).toContain("…")
    })
  })

  // ── Type indicators ───────────────────────────────────────────

  describe("type indicators", () => {
    test("feature type shows ✦", () => {
      const task = mockTask({ type: "feature" })
      expect(formatTaskRow(task)).toContain("✦")
    })

    test("bug type shows ▪", () => {
      const task = mockTask({ type: "bug" })
      expect(formatTaskRow(task)).toContain("▪")
    })

    test("analysis type shows ◇", () => {
      const task = mockTask({ type: "analysis" })
      expect(formatTaskRow(task)).toContain("◇")
    })

    test("null type shows no indicator", () => {
      const task = mockTask({ type: null })
      const row = formatTaskRow(task)
      expect(row).not.toContain("✦")
      expect(row).not.toContain("▪")
      expect(row).not.toContain("◇")
    })
  })

  // ── Combined extras ───────────────────────────────────────────

  describe("combined extras", () => {
    test("blocked task with subtask counts shows both", () => {
      const card = mockTaskCard({
        isBlocked: true,
        subtaskTotal: 3,
        subtaskDone: 1,
      })
      const row = formatTaskRow(card)
      expect(row).toContain("[BLOCKED]")
      expect(row).toContain("[1/3 subtasks]")
    })
  })
})

// ═══════════════════════════════════════════════════════════════════
// formatTaskList
// ═══════════════════════════════════════════════════════════════════

describe("formatTaskList", () => {
  // ── Empty list ────────────────────────────────────────────────

  test("returns 'No tasks found.' for empty array", () => {
    expect(formatTaskList([])).toBe("No tasks found.")
  })

  // ── Header and separator ──────────────────────────────────────

  describe("header and separator", () => {
    test("includes header with ID, Status, Title", () => {
      const list = formatTaskList([mockTask()])
      const lines = list.split("\n")
      expect(lines[0]).toContain("ID")
      expect(lines[0]).toContain("Status")
      expect(lines[0]).toContain("Title")
    })

    test("includes separator line with ─ characters", () => {
      const list = formatTaskList([mockTask()])
      const lines = list.split("\n")
      expect(lines[1]).toMatch(/^─+$/)
    })

    test("ends with separator and count", () => {
      const tasks = [mockTask(), mockTask({ id: "01AABBCCDD2222222233334444" })]
      const list = formatTaskList(tasks)
      const lines = list.split("\n")
      expect(lines[lines.length - 2]).toMatch(/^─+$/)
      expect(lines[lines.length - 1]).toBe("2 task(s)")
    })
  })

  // ── Task count ────────────────────────────────────────────────

  describe("task count", () => {
    test("shows 1 task(s) for single task", () => {
      const list = formatTaskList([mockTask()])
      expect(list).toContain("1 task(s)")
    })

    test("shows correct count for multiple tasks", () => {
      const tasks = [
        mockTask({ id: "01AA000000000000000000001A" }),
        mockTask({ id: "01AA000000000000000000002B" }),
        mockTask({ id: "01AA000000000000000000003C" }),
      ]
      const list = formatTaskList(tasks)
      expect(list).toContain("3 task(s)")
    })
  })

  // ── Ordering: parents first, subtasks nested ──────────────────

  describe("ordering", () => {
    test("parents appear before their subtasks", () => {
      const parentId = "01PARENT0000000000000000AA"
      const tasks = [
        mockTask({
          id: "01CHILD00000000000000000BB",
          parentId,
          title: "Child task",
        }),
        mockTask({
          id: parentId,
          parentId: null,
          title: "Parent task",
        }),
      ]
      const list = formatTaskList(tasks)
      const parentIndex = list.indexOf("Parent task")
      const childIndex = list.indexOf("Child task")
      expect(parentIndex).toBeLessThan(childIndex)
    })

    test("multiple subtasks appear under their parent", () => {
      const parentId = "01PARENT0000000000000000AA"
      const tasks = [
        mockTask({ id: parentId, title: "The Parent" }),
        mockTask({ id: "01CHILD00000000000000001A", parentId, title: "Child One" }),
        mockTask({ id: "01CHILD00000000000000002B", parentId, title: "Child Two" }),
      ]
      const list = formatTaskList(tasks)
      const lines = list.split("\n")
      // Find lines containing the titles (skip header/separator)
      const parentLine = lines.findIndex((l) => l.includes("The Parent"))
      const child1Line = lines.findIndex((l) => l.includes("Child One"))
      const child2Line = lines.findIndex((l) => l.includes("Child Two"))
      expect(parentLine).toBeLessThan(child1Line)
      expect(child1Line).toBeLessThan(child2Line)
    })

    test("subtasks of different parents are grouped under their respective parents", () => {
      const parent1 = "01PARENT0000000000000001AA"
      const parent2 = "01PARENT0000000000000002BB"
      const tasks = [
        mockTask({ id: parent1, title: "Parent Alpha" }),
        mockTask({ id: parent2, title: "Parent Beta" }),
        mockTask({ id: "01CHILD0000000000000001CC", parentId: parent1, title: "Alpha Child" }),
        mockTask({ id: "01CHILD0000000000000002DD", parentId: parent2, title: "Beta Child" }),
      ]
      const list = formatTaskList(tasks)
      const lines = list.split("\n")
      const alphaParent = lines.findIndex((l) => l.includes("Parent Alpha"))
      const alphaChild = lines.findIndex((l) => l.includes("Alpha Child"))
      const betaParent = lines.findIndex((l) => l.includes("Parent Beta"))
      const betaChild = lines.findIndex((l) => l.includes("Beta Child"))
      // Alpha parent -> Alpha child -> Beta parent -> Beta child
      expect(alphaParent).toBeLessThan(alphaChild)
      expect(alphaChild).toBeLessThan(betaParent)
      expect(betaParent).toBeLessThan(betaChild)
    })
  })

  // ── Orphan subtasks ───────────────────────────────────────────

  describe("orphan subtasks", () => {
    test("orphan subtasks (parent not in list) appear at the end", () => {
      const parentId = "01PARENT0000000000000000AA"
      const topLevel = "01TOPLVL0000000000000000BB"
      const tasks = [
        mockTask({ id: topLevel, title: "Top level task" }),
        mockTask({
          id: "01ORPHAN0000000000000000CC",
          parentId,
          title: "Orphan subtask",
        }),
      ]
      const list = formatTaskList(tasks)
      const lines = list.split("\n")
      const topIndex = lines.findIndex((l) => l.includes("Top level task"))
      const orphanIndex = lines.findIndex((l) => l.includes("Orphan subtask"))
      expect(topIndex).toBeLessThan(orphanIndex)
    })

    test("orphan subtasks still show → prefix", () => {
      const tasks = [
        mockTask({
          id: "01ORPHAN0000000000000000CC",
          parentId: "01MISSING000000000000000AA",
          title: "Orphan subtask",
        }),
      ]
      const list = formatTaskList(tasks)
      expect(list).toContain("→")
    })
  })

  // ── Single task ───────────────────────────────────────────────

  test("formats a single task correctly", () => {
    const list = formatTaskList([mockTask({ title: "Only task" })])
    expect(list).toContain("Only task")
    expect(list).toContain("1 task(s)")
  })
})

// ═══════════════════════════════════════════════════════════════════
// formatTaskDetail
// ═══════════════════════════════════════════════════════════════════

describe("formatTaskDetail", () => {
  // ── Box-drawing characters ────────────────────────────────────

  describe("box-drawing characters", () => {
    test("starts with ╔ top border", () => {
      const detail = mockTaskDetail()
      const output = formatTaskDetail(detail)
      expect(output.startsWith("╔")).toBe(true)
    })

    test("ends with ╚ bottom border", () => {
      const detail = mockTaskDetail()
      const output = formatTaskDetail(detail)
      const lines = output.split("\n")
      expect(lines[lines.length - 1].startsWith("╚")).toBe(true)
    })

    test("contains section separators ╠", () => {
      const detail = mockTaskDetail()
      const output = formatTaskDetail(detail)
      expect(output).toContain("╠")
    })

    test("every content line starts with ║ and ends with ║", () => {
      const detail = mockTaskDetail({ title: "A task" })
      const output = formatTaskDetail(detail)
      const lines = output.split("\n")
      for (const line of lines) {
        // Skip top/bottom borders and section separators
        if (line.startsWith("╔") || line.startsWith("╚") || line.startsWith("╠")) continue
        expect(line.startsWith("║")).toBe(true)
        expect(line.endsWith("║")).toBe(true)
      }
    })
  })

  // ── Metadata fields ───────────────────────────────────────────

  describe("metadata", () => {
    test("shows task title", () => {
      const detail = mockTaskDetail({ title: "My Important Task" })
      expect(formatTaskDetail(detail)).toContain("My Important Task")
    })

    test("shows task ID", () => {
      const detail = mockTaskDetail({ id: "01AABBCCDD1111111122223333" })
      expect(formatTaskDetail(detail)).toContain("01AABBCCDD1111111122223333")
    })

    test("shows status icon and label", () => {
      const detail = mockTaskDetail({ status: "in_progress" })
      const output = formatTaskDetail(detail)
      expect(output).toContain("🔧")
      expect(output).toContain("In Progress")
    })

    test("shows priority icon and label", () => {
      const detail = mockTaskDetail({ priority: "high" })
      const output = formatTaskDetail(detail)
      expect(output).toContain("🟡")
      expect(output).toContain("High")
    })

    test("shows source field", () => {
      const detail = mockTaskDetail({ source: "opencode" })
      expect(formatTaskDetail(detail)).toContain("opencode")
    })

    test("defaults source to 'manual' when falsy", () => {
      const detail = mockTaskDetail()
      // Simulate a null source at runtime (e.g., from raw DB data)
      ;(detail as Record<string, unknown>).source = null
      expect(formatTaskDetail(detail)).toContain("manual")
    })

    test("shows type when present", () => {
      const detail = mockTaskDetail({ type: "bug" })
      const output = formatTaskDetail(detail)
      expect(output).toContain("Bug")
      expect(output).toContain("▪")
    })

    test("omits type line when type is null", () => {
      const detail = mockTaskDetail({ type: null })
      const output = formatTaskDetail(detail)
      expect(output).not.toContain("Type:")
    })

    test("shows tags when present", () => {
      const detail = mockTaskDetail({ tags: ["frontend", "urgent", "auth"] })
      const output = formatTaskDetail(detail)
      expect(output).toContain("frontend, urgent, auth")
    })

    test("omits tags line when tags is empty", () => {
      const detail = mockTaskDetail({ tags: [] })
      const output = formatTaskDetail(detail)
      expect(output).not.toContain("Tags:")
    })

    test("shows parent ID for subtasks", () => {
      const detail = mockTaskDetail({ parentId: "01PARENT0000000000000000AA" })
      const output = formatTaskDetail(detail)
      expect(output).toContain("Parent:")
      expect(output).toContain("000000AA") // last 8 chars
    })

    test("omits parent line for top-level tasks", () => {
      const detail = mockTaskDetail({ parentId: null })
      expect(formatTaskDetail(detail)).not.toContain("Parent:")
    })
  })

  // ── Description ───────────────────────────────────────────────

  describe("description", () => {
    test("shows description when present", () => {
      const detail = mockTaskDetail({ description: "This is a task description." })
      const output = formatTaskDetail(detail)
      expect(output).toContain("Description:")
      expect(output).toContain("This is a task description.")
    })

    test("handles multi-line descriptions", () => {
      const detail = mockTaskDetail({
        description: "Line one\nLine two\nLine three",
      })
      const output = formatTaskDetail(detail)
      expect(output).toContain("Line one")
      expect(output).toContain("Line two")
      expect(output).toContain("Line three")
    })

    test("omits description section when null", () => {
      const detail = mockTaskDetail({ description: null })
      expect(formatTaskDetail(detail)).not.toContain("Description:")
    })

    test("truncates very long description lines", () => {
      const longLine = "X".repeat(100)
      const detail = mockTaskDetail({ description: longLine })
      const output = formatTaskDetail(detail)
      // The description line should be truncated (72 chars max) with …
      expect(output).toContain("…")
    })
  })

  // ── Subtasks ──────────────────────────────────────────────────

  describe("subtasks", () => {
    test("shows subtask section with count", () => {
      const detail = mockTaskDetail({
        subtasks: [
          mockTask({ id: "01SUB10000000000000000001A", title: "Subtask 1", status: "done" }),
          mockTask({ id: "01SUB20000000000000000002B", title: "Subtask 2", status: "todo" }),
        ],
      })
      const output = formatTaskDetail(detail)
      expect(output).toContain("Subtasks (2):")
    })

    test("shows ✓ for done subtasks", () => {
      const detail = mockTaskDetail({
        subtasks: [
          mockTask({ id: "01SUB10000000000000000001A", title: "Done sub", status: "done" }),
        ],
      })
      const output = formatTaskDetail(detail)
      expect(output).toContain("✓ Done sub")
    })

    test("shows ○ for non-done subtasks", () => {
      const detail = mockTaskDetail({
        subtasks: [
          mockTask({ id: "01SUB10000000000000000001A", title: "Pending sub", status: "todo" }),
        ],
      })
      const output = formatTaskDetail(detail)
      expect(output).toContain("○ Pending sub")
    })

    test("omits subtask section when empty", () => {
      const detail = mockTaskDetail({ subtasks: [] })
      expect(formatTaskDetail(detail)).not.toContain("Subtasks")
    })
  })

  // ── Dependencies ──────────────────────────────────────────────

  describe("dependencies", () => {
    test("shows 'Depends On' section with count", () => {
      const dep = mockTask({ id: "01DEP10000000000000000001A", title: "Dependency task", status: "done" })
      const detail = mockTaskDetail({ dependsOn: [dep] })
      const output = formatTaskDetail(detail)
      expect(output).toContain("Depends On (1):")
    })

    test("shows ✓ for done dependencies", () => {
      const dep = mockTask({ id: "01DEP10000000000000000001A", title: "Done dep", status: "done" })
      const detail = mockTaskDetail({ dependsOn: [dep] })
      const output = formatTaskDetail(detail)
      expect(output).toContain("✓")
      expect(output).toContain("Done dep")
    })

    test("shows ○ for non-done dependencies", () => {
      const dep = mockTask({ id: "01DEP10000000000000000001A", title: "Pending dep", status: "in_progress" })
      const detail = mockTaskDetail({ dependsOn: [dep] })
      const output = formatTaskDetail(detail)
      expect(output).toContain("○")
      expect(output).toContain("Pending dep")
    })

    test("shows dependency ID (last 8 chars)", () => {
      const dep = mockTask({ id: "01DEP10000000000000000001A", title: "Some dep" })
      const detail = mockTaskDetail({ dependsOn: [dep] })
      const output = formatTaskDetail(detail)
      expect(output).toContain("0000001A")
    })

    test("omits depends-on section when empty", () => {
      const detail = mockTaskDetail({ dependsOn: [] })
      expect(formatTaskDetail(detail)).not.toContain("Depends On")
    })

    test("shows 'Blocking' section with count", () => {
      const blocker = mockTask({ id: "01BLOCK000000000000000001A", title: "Blocked task" })
      const detail = mockTaskDetail({ dependedOnBy: [blocker] })
      const output = formatTaskDetail(detail)
      expect(output).toContain("Blocking (1):")
    })

    test("shows blocking task ID (last 8 chars)", () => {
      const blocker = mockTask({ id: "01BLOCK000000000000000001A", title: "Blocked task" })
      const detail = mockTaskDetail({ dependedOnBy: [blocker] })
      const output = formatTaskDetail(detail)
      expect(output).toContain("0000001A")
    })

    test("omits blocking section when empty", () => {
      const detail = mockTaskDetail({ dependedOnBy: [] })
      expect(formatTaskDetail(detail)).not.toContain("Blocking")
    })

    test("shows multiple dependencies", () => {
      const deps = [
        mockTask({ id: "01DEP1000000000000000001AA", title: "Dep one", status: "done" }),
        mockTask({ id: "01DEP2000000000000000002BB", title: "Dep two", status: "todo" }),
      ]
      const detail = mockTaskDetail({ dependsOn: deps })
      const output = formatTaskDetail(detail)
      expect(output).toContain("Depends On (2):")
      expect(output).toContain("Dep one")
      expect(output).toContain("Dep two")
    })
  })

  // ── Status history ────────────────────────────────────────────

  describe("status history", () => {
    test("shows status history section", () => {
      const history = [
        mockHistoryEntry({ fromStatus: null, toStatus: "backlog", changedAt: new Date("2026-01-01T10:00:00Z") }),
        mockHistoryEntry({ fromStatus: "backlog", toStatus: "todo", changedAt: new Date("2026-01-02T10:00:00Z") }),
      ]
      const detail = mockTaskDetail({ statusHistory: history })
      const output = formatTaskDetail(detail)
      expect(output).toContain("Status History:")
    })

    test("shows from → to transition labels", () => {
      const history = [
        mockHistoryEntry({ fromStatus: "backlog", toStatus: "todo", changedAt: new Date("2026-01-01T10:00:00Z") }),
      ]
      const detail = mockTaskDetail({ statusHistory: history })
      const output = formatTaskDetail(detail)
      expect(output).toContain("Backlog")
      expect(output).toContain("→")
      expect(output).toContain("To Do")
    })

    test("shows — for null fromStatus (initial creation)", () => {
      const history = [
        mockHistoryEntry({ fromStatus: null, toStatus: "backlog", changedAt: new Date("2026-01-01T10:00:00Z") }),
      ]
      const detail = mockTaskDetail({ statusHistory: history })
      const output = formatTaskDetail(detail)
      expect(output).toContain("—")
      expect(output).toContain("→")
      expect(output).toContain("Backlog")
    })

    test("shows date in ISO format (truncated to minute)", () => {
      const history = [
        mockHistoryEntry({ fromStatus: null, toStatus: "backlog", changedAt: new Date("2026-03-15T14:30:00Z") }),
      ]
      const detail = mockTaskDetail({ statusHistory: history })
      const output = formatTaskDetail(detail)
      expect(output).toContain("2026-03-15T14:30")
    })

    test("limits display to 10 entries", () => {
      const history: TaskStatusHistoryEntry[] = []
      for (let i = 0; i < 15; i++) {
        history.push(
          mockHistoryEntry({
            id: `01HIST${String(i).padStart(20, "0")}`,
            fromStatus: i === 0 ? null : "backlog",
            toStatus: i % 2 === 0 ? "backlog" : "todo",
            changedAt: new Date(`2026-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`),
          })
        )
      }
      const detail = mockTaskDetail({ statusHistory: history })
      const output = formatTaskDetail(detail)
      // Should contain entry for Jan 10 (index 9) but not Jan 11 (index 10)
      expect(output).toContain("2026-01-10")
      expect(output).not.toContain("2026-01-11")
    })

    test("omits status history section when empty", () => {
      const detail = mockTaskDetail({ statusHistory: [] })
      expect(formatTaskDetail(detail)).not.toContain("Status History:")
    })
  })

  // ── Timestamps ────────────────────────────────────────────────

  describe("timestamps", () => {
    test("shows created timestamp", () => {
      const detail = mockTaskDetail({ createdAt: new Date("2026-02-15T09:30:00Z") })
      const output = formatTaskDetail(detail)
      expect(output).toContain("Created:")
      expect(output).toContain("2026-02-15T09:30")
    })

    test("shows updated timestamp", () => {
      const detail = mockTaskDetail({ updatedAt: new Date("2026-02-20T16:45:00Z") })
      const output = formatTaskDetail(detail)
      expect(output).toContain("Updated:")
      expect(output).toContain("2026-02-20T16:45")
    })
  })

  // ── Edge cases ────────────────────────────────────────────────

  describe("edge cases", () => {
    test("minimal task with no optional fields", () => {
      const detail = mockTaskDetail({
        description: null,
        tags: [],
        type: null,
        parentId: null,
        subtasks: [],
        dependsOn: [],
        dependedOnBy: [],
        statusHistory: [],
      })
      const output = formatTaskDetail(detail)
      // Should still render without errors
      expect(output).toContain("╔")
      expect(output).toContain("╚")
      expect(output).toContain("Created:")
      expect(output).toContain("Updated:")
    })

    test("task with all sections populated", () => {
      const detail = mockTaskDetail({
        title: "Full task",
        description: "A description",
        type: "feature",
        tags: ["tag1", "tag2"],
        parentId: "01PARENT0000000000000000AA",
        subtasks: [mockTask({ id: "01SUB10000000000000000001A", title: "Sub 1" })],
        dependsOn: [mockTask({ id: "01DEP10000000000000000001A", title: "Dep 1" })],
        dependedOnBy: [mockTask({ id: "01BLOCK000000000000000001A", title: "Blocker 1" })],
        statusHistory: [mockHistoryEntry()],
      })
      const output = formatTaskDetail(detail)
      expect(output).toContain("Full task")
      expect(output).toContain("Description:")
      expect(output).toContain("Feature")
      expect(output).toContain("tag1, tag2")
      expect(output).toContain("Parent:")
      expect(output).toContain("Subtasks (1):")
      expect(output).toContain("Depends On (1):")
      expect(output).toContain("Blocking (1):")
      expect(output).toContain("Status History:")
    })

    test("special characters in title", () => {
      const detail = mockTaskDetail({ title: "Fix <html> & \"quotes\" issue" })
      const output = formatTaskDetail(detail)
      expect(output).toContain("Fix <html> & \"quotes\" issue")
    })

    test("special characters in description", () => {
      const detail = mockTaskDetail({
        description: "Handle `backticks` and $variables and {braces}",
      })
      const output = formatTaskDetail(detail)
      expect(output).toContain("Handle `backticks` and $variables and {braces}")
    })
  })
})

// ═══════════════════════════════════════════════════════════════════
// jsonOutput
// ═══════════════════════════════════════════════════════════════════

describe("jsonOutput", () => {
  test("returns pretty-printed JSON", () => {
    const data = { key: "value" }
    const output = jsonOutput(data)
    expect(output).toBe(JSON.stringify(data, null, 2))
  })

  test("handles nested objects", () => {
    const data = {
      task: {
        id: "123",
        meta: {
          priority: "high",
          tags: ["a", "b"],
        },
      },
    }
    const output = jsonOutput(data)
    expect(output).toBe(JSON.stringify(data, null, 2))
    expect(output).toContain("  ")  // indentation present
    expect(output).toContain('"priority": "high"')
  })

  test("handles arrays", () => {
    const data = [1, 2, 3]
    expect(jsonOutput(data)).toBe("[\n  1,\n  2,\n  3\n]")
  })

  test("handles null", () => {
    expect(jsonOutput(null)).toBe("null")
  })

  test("handles strings", () => {
    expect(jsonOutput("hello")).toBe('"hello"')
  })

  test("handles empty object", () => {
    expect(jsonOutput({})).toBe("{}")
  })

  test("handles empty array", () => {
    expect(jsonOutput([])).toBe("[]")
  })

  test("handles boolean values", () => {
    expect(jsonOutput(true)).toBe("true")
    expect(jsonOutput(false)).toBe("false")
  })

  test("handles numbers", () => {
    expect(jsonOutput(42)).toBe("42")
    expect(jsonOutput(3.14)).toBe("3.14")
  })

  test("handles deeply nested structures", () => {
    const data = { a: { b: { c: { d: "deep" } } } }
    const output = jsonOutput(data)
    expect(output).toContain('"d": "deep"')
    // Verify it's valid JSON by parsing it back
    expect(JSON.parse(output)).toEqual(data)
  })

  test("handles special characters in strings", () => {
    const data = { msg: 'Hello "world"\nNew line\ttab' }
    const output = jsonOutput(data)
    const parsed = JSON.parse(output)
    expect(parsed.msg).toBe('Hello "world"\nNew line\ttab')
  })
})

// ═══════════════════════════════════════════════════════════════════
// formatSuccess / formatError
// ═══════════════════════════════════════════════════════════════════

describe("formatSuccess", () => {
  test("prefixes with ✓", () => {
    expect(formatSuccess("Done")).toBe("✓ Done")
  })

  test("works with empty string", () => {
    expect(formatSuccess("")).toBe("✓ ")
  })

  test("preserves message content", () => {
    const msg = "Task ABC12345 moved to done"
    expect(formatSuccess(msg)).toBe(`✓ ${msg}`)
  })

  test("works with special characters", () => {
    expect(formatSuccess("Created: <task>")).toBe("✓ Created: <task>")
  })
})

describe("formatError", () => {
  test("prefixes with ✗", () => {
    expect(formatError("Failed")).toBe("✗ Failed")
  })

  test("works with empty string", () => {
    expect(formatError("")).toBe("✗ ")
  })

  test("preserves message content", () => {
    const msg = "No task found matching 'XYZ'"
    expect(formatError(msg)).toBe(`✗ ${msg}`)
  })

  test("works with special characters", () => {
    expect(formatError("Error: \"invalid\" input")).toBe("✗ Error: \"invalid\" input")
  })
})
