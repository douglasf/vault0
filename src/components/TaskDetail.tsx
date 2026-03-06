import { useState, useRef, useCallback } from "react"
import { TextAttributes } from "@opentui/core"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { Task, TaskDetail as TaskDetailType } from "../lib/types.js"
import { useDb } from "../lib/db-context.js"
import { getTaskDetail } from "../db/queries.js"
import { getStatusLabel, getPriorityLabel, getTypeLabel, formatDate, formatDateTime, isResolvedStatus, truncateText } from "../lib/format.js"
import { getPriorityColor, getStatusColor, getTaskTypeColor, theme, getMarkdownSyntaxStyle } from "../lib/theme.js"
import { copyToClipboard } from "../lib/clipboard.js"
import { useToast } from "../lib/toast-context.js"
import { useKeybindScope } from "../hooks/useKeybindScope.js"
import { useKeybind } from "../hooks/useKeybind.js"
import { SCOPE_PRIORITY } from "../lib/keybind-registry.js"

export interface TaskDetailProps {
  taskId: string
  onBack: () => void
  onEdit: (task: Task) => void
  onStatusPick: (task: Task) => void
  onCyclePriority: (taskId: string) => void
  onDelete: (taskId: string) => void
  onUnarchive: (taskId: string) => void
  onCreateSubtask: (parent: Task) => void
  onShowDependencyPicker: () => void
  onShowDependencyRemover: () => void
  onShowDeleteConfirm: () => void
  inputActive?: boolean
}

/**
 * Full-screen detail view for a single task.
 *
 * Displays all task metadata (status, priority, type, tags, dates), a markdown-rendered
 * description, dependency graph, subtask checklist, and status history inside a scrollable
 * container. Supports keyboard shortcuts for editing, status changes, dependency management,
 * and clipboard operations.
 */
export function TaskDetail({
  taskId,
  onBack,
  onEdit,
  onStatusPick,
  onCyclePriority,
  onDelete,
  onUnarchive,
  onCreateSubtask,
  onShowDependencyPicker,
  onShowDependencyRemover,
  onShowDeleteConfirm,
  inputActive = true,
}: TaskDetailProps) {
  const db = useDb()
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const [dependencyError, setDependencyError] = useState("")
  const { showToast } = useToast()

  // Fetch fresh detail data on every render (sync DB, no caching needed)
  let detail: TaskDetailType
  try {
    detail = getTaskDetail(db, taskId)
  } catch {
    return (
      <box flexDirection="column" backgroundColor={theme.bg_1} paddingX={2} paddingY={1}>
        <text fg={theme.red}>Task not found (may have been archived)</text>
        <box marginTop={1}>
          <text fg={theme.dim_0}>Press Esc to go back</text>
        </box>
      </box>
    )
  }

  // Build content lines for scrollable display
  const sections = buildSections(detail)

  // Compute available height for the scrollbox.
  // Total overhead = App Header (3) + TaskDetail chrome (6) = 9 lines.
  // App Header: content rows(2) + marginBottom(1) = 3
  // TaskDetail: paddingY(2) + title(1) + content margin(1) + footer margin(1) + footer(1) = 6
  const { height: rows } = useTerminalDimensions()
  const scrollHeight = Math.max(1, (rows || 24) - 9)

  const scope = useKeybindScope("detail", {
    priority: SCOPE_PRIORITY.VIEW,
    active: inputActive,
  })

  useKeybind(scope, "Escape", onBack, { description: "Close detail" })
  useKeybind(scope, "e", useCallback(() => onEdit(detail), [detail, onEdit]), { description: "Edit task" })
  useKeybind(scope, "s", useCallback(() => onStatusPick(detail), [detail, onStatusPick]), { description: "Change status" })
  useKeybind(scope, "p", useCallback(() => onCyclePriority(detail.id), [detail.id, onCyclePriority]), { description: "Cycle priority" })
  useKeybind(scope, "d", onShowDeleteConfirm, { description: "Delete task" })
  useKeybind(scope, "u", useCallback(() => {
    if (detail.archivedAt !== null) onUnarchive(detail.id)
  }, [detail.archivedAt, detail.id, onUnarchive]), { description: "Unarchive task" })
  useKeybind(scope, "A", useCallback(() => {
    if (!detail.parentId) onCreateSubtask(detail)
  }, [detail, onCreateSubtask]), { description: "Add subtask" })
  useKeybind(scope, "c", useCallback(() => {
    const ok = copyToClipboard(detail.id)
    showToast(ok ? "Copied" : "Copy failed", ok ? detail.id : "Could not copy to clipboard")
  }, [detail.id, showToast]), { description: "Copy task ID" })
  useKeybind(scope, "+", useCallback(() => {
    onShowDependencyPicker()
    setDependencyError("")
  }, [onShowDependencyPicker]), { description: "Add dependency" })
  useKeybind(scope, "-", useCallback(() => {
    if (detail.dependsOn.length > 0) {
      onShowDependencyRemover()
      setDependencyError("")
    }
  }, [detail.dependsOn.length, onShowDependencyRemover]), { description: "Remove dependency" })
  useKeybind(scope, "ArrowUp", useCallback(() => scrollRef.current?.scrollBy(-1), []), { description: "Scroll up" })
  useKeybind(scope, "ArrowDown", useCallback(() => scrollRef.current?.scrollBy(1), []), { description: "Scroll down" })
  useKeybind(scope, "PageUp", useCallback(() => scrollRef.current?.scrollBy(-scrollHeight), [scrollHeight]), { description: "Page up" })
  useKeybind(scope, "PageDown", useCallback(() => scrollRef.current?.scrollBy(scrollHeight), [scrollHeight]), { description: "Page down" })


  return (
    <box flexDirection="column" width="100%">
      <box flexDirection="column" backgroundColor={theme.bg_1} paddingX={2} paddingY={1} width="100%">
        {/* Header */}
        <box justifyContent="center">
          <text attributes={TextAttributes.BOLD} fg={theme.blue}>Task Detail</text>
        </box>

        {/* Scrollable content */}
        <scrollbox ref={scrollRef} scrollY flexGrow={1} marginTop={1} height={scrollHeight}>
          {sections.map((line, i) => (
            <SectionLine key={`${line.type}-${i}`} line={line} />
          ))}
        </scrollbox>

        {/* Dependency error */}
        {dependencyError && (
          <box marginTop={1}>
            <text fg={theme.red}>⚠ {dependencyError}</text>
          </box>
        )}

        {/* Footer shortcuts */}
        <box marginTop={1} justifyContent="center">
          <text fg={theme.dim_0}>
            [e]dit  [s]tatus  [p]riority  [d]elete  {detail.archivedAt !== null && "[u]narchive  "}{!detail.parentId && "[A]dd subtask  "}[c]opy id  [+]dep  [-]dep  [Esc]back  ↑↓ scroll
          </text>
        </box>
      </box>
    </box>
  )
}

// ── Section line types ──────────────────────────────────────────────

interface LineData {
  type: "heading" | "field" | "dep" | "subtask" | "history" | "blank" | "text" | "blocked-banner" | "markdown" | "tags"
  label?: string
  value?: string
  color?: string
  bold?: boolean
  dimmed?: boolean
  status?: string
  done?: boolean
  tags?: string[]
}

/**
 * Renders a single line/section within the scrollable task detail content.
 * Each line type maps to a distinct visual treatment (heading, field, dependency arrow, etc.).
 */
function SectionLine({ line }: { line: LineData }) {
  switch (line.type) {
    case "heading":
      return (
        <box>
          <text attributes={TextAttributes.BOLD} fg={theme.blue}>── {line.label} ──</text>
        </box>
      )
    case "field":
      return (
        <box flexDirection="row">
          <text fg={theme.dim_0}>{line.label}: </text>
          <text fg={line.color ?? theme.fg_1} attributes={line.bold ? TextAttributes.BOLD : TextAttributes.NONE}>{line.value}</text>
        </box>
      )
    case "dep":
      return (
        <box flexDirection="row">
          <text fg={theme.fg_1}>{line.label === "depends_on" ? "  → " : "  ← "}</text>
          <text fg={theme.fg_1}>{line.value}</text>
          <text fg={theme.dim_0}> </text>
          <text fg={getStatusColor(line.status || "")}>[{getStatusLabel(line.status || "")}]</text>
        </box>
      )
    case "subtask":
      return (
        <box flexDirection="row">
          <text fg={theme.fg_1}>  {line.done ? "[x]" : "[ ]"} </text>
          <text fg={line.done ? theme.dim_0 : theme.fg_1}>{line.value}</text>
        </box>
      )
    case "history":
      return (
        <box flexDirection="row">
          <text fg={theme.dim_0}>  {line.label}  </text>
          <text fg={theme.fg_1}>{line.value}</text>
        </box>
      )
    case "blocked-banner":
      return (
        <box>
          <text fg={theme.red} attributes={TextAttributes.BOLD}>🔒 Blocked — waiting on {line.value} {Number(line.value) === 1 ? "dependency" : "dependencies"}</text>
        </box>
      )
    case "text":
      return (
        <box>
          <text fg={line.dimmed ? theme.dim_0 : (line.color ?? theme.fg_1)}>{line.value}</text>
        </box>
      )
    case "markdown":
      return (
        <markdown content={line.value ?? ""} syntaxStyle={getMarkdownSyntaxStyle()} conceal={true} />
      )
    case "tags":
      return (
        <box flexDirection="row" flexWrap="wrap" columnGap={1}>
          <text fg={theme.dim_0}>{line.label}: </text>
          {(line.tags ?? []).map((tag, i) => (
            <text key={tag} fg={theme.cyan} bg={theme.bg_2}> {tag} </text>
          ))}
        </box>
      )
    case "blank":
      return <box><text> </text></box>
    default:
      return null
  }
}

// ── Build section data ──────────────────────────────────────────────

/** Assembles all display sections for a task into a flat list of renderable lines. */
function buildSections(detail: TaskDetailType): LineData[] {
  const lines: LineData[] = []

  // Basic info
  lines.push({ type: "field", label: "Title", value: detail.title, bold: true })
  lines.push({ type: "field", label: "ID", value: detail.id, dimmed: true })
  lines.push({
    type: "field",
    label: "Status",
    value: getStatusLabel(detail.status),
    color: getStatusColor(detail.status),
  })
  lines.push({
    type: "field",
    label: "Priority",
    value: getPriorityLabel(detail.priority),
    color: getPriorityColor(detail.priority),
  })
  if (detail.type) {
    lines.push({
      type: "field",
      label: "Type",
      value: getTypeLabel(detail.type) ?? detail.type,
      color: getTaskTypeColor(detail.type),
    })
  }
  lines.push({ type: "field", label: "Source", value: detail.source || "manual" })
  if (detail.sourceRef) {
    lines.push({ type: "field", label: "Source Ref", value: detail.sourceRef })
  }

  const tags = detail.tags as string[] | null
  if (tags && tags.length > 0) {
    lines.push({ type: "tags", label: "Tags", tags })
  }

  lines.push({
    type: "field",
    label: "Created",
    value: formatDate(detail.createdAt),
    dimmed: true,
  })
  lines.push({
    type: "field",
    label: "Updated",
    value: formatDate(detail.updatedAt),
    dimmed: true,
  })

  // Blocked banner
  const blockerCount = detail.dependsOn.filter((d) => !isResolvedStatus(d.status)).length
  if (blockerCount > 0) {
    lines.push({ type: "blank" })
    lines.push({ type: "blocked-banner", value: String(blockerCount) })
  }

  // Description
  if (detail.description) {
    lines.push({ type: "blank" })
    lines.push({ type: "heading", label: "Description" })
    lines.push({ type: "markdown", value: detail.description })
  }

  // Solution
  if (detail.solution) {
    lines.push({ type: "blank" })
    lines.push({ type: "heading", label: "Solution" })
    lines.push({ type: "markdown", value: detail.solution })
  }

  // Dependencies
  if (detail.dependsOn.length > 0) {
    lines.push({ type: "blank" })
    lines.push({ type: "heading", label: `Dependencies (${detail.dependsOn.length})` })
    for (const dep of detail.dependsOn) {
      lines.push({
        type: "dep",
        label: "depends_on",
        value: dep.title,
        status: dep.status,
      })
    }
  }

  // Depended on by
  if (detail.dependedOnBy.length > 0) {
    lines.push({ type: "blank" })
    lines.push({ type: "heading", label: `Depended on by (${detail.dependedOnBy.length})` })
    for (const dep of detail.dependedOnBy) {
      lines.push({
        type: "dep",
        label: "depended_on_by",
        value: dep.title,
        status: dep.status,
      })
    }
  }

  // Subtasks
  if (detail.subtasks.length > 0) {
    const doneCount = detail.subtasks.filter((s) => s.status === "done").length
    lines.push({ type: "blank" })
    lines.push({ type: "heading", label: `Subtasks (${doneCount}/${detail.subtasks.length})` })
    for (const st of detail.subtasks) {
      lines.push({
        type: "subtask",
        value: st.title,
        done: st.status === "done",
      })
    }
  }

  // Status history
  if (detail.statusHistory.length > 0) {
    lines.push({ type: "blank" })
    lines.push({ type: "heading", label: "History" })
    for (const h of detail.statusHistory) {
      const fromLabel = h.fromStatus ? getStatusLabel(h.fromStatus) : "—"
      const toLabel = getStatusLabel(h.toStatus)
      lines.push({
        type: "history",
        label: formatDateTime(h.changedAt),
        value: `${fromLabel} → ${toLabel}`,
      })
    }
  }

  return lines
}


