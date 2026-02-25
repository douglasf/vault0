import { useState, useRef, useCallback, useEffect } from "react"
import { TextAttributes } from "@opentui/core"
import type { KeyEvent, ScrollBoxRenderable, SelectOption } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { Task, TaskDetail as TaskDetailType } from "../lib/types.js"
import { useDb } from "../lib/db-context.js"
import { getTaskDetail, addDependency, removeDependency } from "../db/queries.js"
import { getStatusLabel, getPriorityLabel, getTypeLabel, formatDate, formatDateTime, isResolvedStatus, errorMessage, truncateText } from "../lib/format.js"
import { getPriorityColor, getStatusColor, getTaskTypeColor, theme, getMarkdownSyntaxStyle } from "../lib/theme.js"
import { copyToClipboard } from "../lib/clipboard.js"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"
import { DependencyPicker } from "./DependencyPicker.js"

export interface TaskDetailProps {
  taskId: string
  onBack: () => void
  onEdit: (task: Task) => void
  onStatusPick: (task: Task) => void
  onCyclePriority: (taskId: string) => void
  onDelete: (taskId: string) => void
  onUnarchive: (taskId: string) => void
  onCreateSubtask: (parent: Task) => void
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
}: TaskDetailProps) {
  const db = useDb()
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const [showDependencyPicker, setShowDependencyPicker] = useState(false)
  const [showDependencyRemover, setShowDependencyRemover] = useState(false)
  const [dependencyError, setDependencyError] = useState("")
  const [copyToast, setCopyToast] = useState("")
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showCopyToast = useCallback((message: string) => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    setCopyToast(message)
    copyTimerRef.current = setTimeout(() => setCopyToast(""), 2000)
  }, [])

  // Clean up dangling timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

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

  useActiveKeyboard((event: KeyEvent) => {
    if (event.name === "escape") {
      onBack()
    } else if (event.raw === "e" && !event.ctrl && !event.meta) {
      onEdit(detail)
    } else if (event.raw === "s" && !event.ctrl && !event.meta) {
      onStatusPick(detail)
    } else if (event.raw === "p" && !event.ctrl && !event.meta) {
      onCyclePriority(detail.id)
    } else if (event.raw === "d" && !event.ctrl && !event.meta) {
      onDelete(detail.id)
    } else if (event.raw === "u" && !event.ctrl && !event.meta) {
      if (detail.archivedAt !== null) {
        onUnarchive(detail.id)
      }
    } else if (event.raw === "A" && !event.ctrl && !event.meta) {
      // Only allow adding subtasks to top-level tasks (not subtasks of subtasks)
      if (!detail.parentId) {
        onCreateSubtask(detail)
      }
    } else if (event.raw === "c" && !event.ctrl && !event.meta) {
      const ok = copyToClipboard(detail.id)
      showCopyToast(ok ? `Copied: ${detail.id}` : "Copy failed")
    } else if (event.raw === "+" && !event.ctrl && !event.meta) {
      setShowDependencyPicker(true)
      setDependencyError("")
    } else if (event.raw === "-" && !event.ctrl && !event.meta && detail.dependsOn.length > 0) {
      setShowDependencyRemover(true)
      setDependencyError("")
    } else if (event.name === "up") {
      scrollRef.current?.scrollBy(-1)
    } else if (event.name === "down") {
      scrollRef.current?.scrollBy(1)
    } else if (event.name === "pageup") {
      scrollRef.current?.scrollBy(-scrollHeight)
    } else if (event.name === "pagedown") {
      scrollRef.current?.scrollBy(scrollHeight)
    }
  }, !showDependencyPicker && !showDependencyRemover)

  // Escape handler for dependency removal overlay
  useActiveKeyboard((event: KeyEvent) => {
    if (event.name === "escape") {
      setShowDependencyRemover(false)
    }
  }, showDependencyRemover)

  return (
    <box flexDirection="column" width="100%">
      {showDependencyPicker ? (
        <DependencyPicker
          currentTaskId={taskId}
          boardId={detail.boardId}
          existingDependencyIds={detail.dependsOn.map((d) => d.id)}
          onSelectDependency={(depId) => {
            try {
              addDependency(db, detail.id, depId)
              setDependencyError("")
            } catch (error) {
              setDependencyError(errorMessage(error))
            }
            setShowDependencyPicker(false)
          }}
          onCancel={() => setShowDependencyPicker(false)}
        />
      ) : showDependencyRemover ? (
        <box flexDirection="column" backgroundColor={theme.bg_1} paddingX={2} paddingY={1}>
          <text attributes={TextAttributes.BOLD} fg={theme.yellow}>Remove Dependency</text>

          <select
            marginTop={1}
            focused={true}
            width={55}
            height={Math.min(detail.dependsOn.length * 2, 16)}
            showDescription={false}
            options={detail.dependsOn.map((dep) => ({
              name: `${truncateText(dep.title, 45)} [${getStatusLabel(dep.status)}]`,
              description: "",
              value: dep.id,
            }))}
            selectedBackgroundColor={theme.yellow}
            selectedTextColor={theme.bg_1}
            textColor={theme.fg_1}
            backgroundColor={theme.bg_1}
            onSelect={(_index: number, option: SelectOption | null) => {
              if (option?.value) {
                try {
                  removeDependency(db, detail.id, option.value)
                  setDependencyError("")
                } catch (error) {
                  setDependencyError(errorMessage(error))
                }
              }
              setShowDependencyRemover(false)
            }}
          />

          <box marginTop={1}>
            <text fg={theme.dim_0}>↑/↓: navigate  Enter: remove  Esc: cancel</text>
          </box>
        </box>
      ) : (
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

          {/* Copy toast */}
          {copyToast && (
            <box marginTop={dependencyError ? 0 : 1}>
              <text fg={theme.green} attributes={TextAttributes.BOLD}>✓ {copyToast}</text>
            </box>
          )}

          {/* Footer shortcuts */}
          <box marginTop={1} justifyContent="center">
            <text fg={theme.dim_0}>
              [e]dit  [s]tatus  [p]riority  [d]elete  {detail.archivedAt !== null && "[u]narchive  "}{!detail.parentId && "[A]dd subtask  "}[c]opy id  [+]dep  [-]dep  [Esc]back  ↑↓ scroll
            </text>
          </box>
        </box>
      )}
    </box>
  )
}

// ── Section line types ──────────────────────────────────────────────

interface LineData {
  type: "heading" | "field" | "dep" | "subtask" | "history" | "blank" | "text" | "blocked-banner" | "markdown"
  label?: string
  value?: string
  color?: string
  bold?: boolean
  dimmed?: boolean
  status?: string
  done?: boolean
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
    lines.push({ type: "field", label: "Tags", value: `[${tags.join(", ")}]` })
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


