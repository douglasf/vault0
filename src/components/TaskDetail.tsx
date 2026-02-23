import React, { useState, useRef, useCallback, useEffect } from "react"
import { TextAttributes } from "@opentui/core"
import type { KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { Task, Status, Priority, TaskType, TaskDetail as TaskDetailType } from "../lib/types.js"
import { useDb } from "../lib/db-context.js"
import { getTaskDetail, addDependency, removeDependency } from "../db/queries.js"
import { STATUS_LABELS, PRIORITY_LABELS, TASK_TYPE_LABELS } from "../lib/constants.js"
import { getPriorityColor, getStatusColor, getTaskTypeColor } from "../lib/theme.js"
import { theme } from "../lib/theme.js"
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
  const [removeDepIndex, setRemoveDepIndex] = useState(0)
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
      setRemoveDepIndex(0)
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

  // Dependency removal overlay input handler
  useActiveKeyboard((event: KeyEvent) => {
    if (event.name === "up") {
      setRemoveDepIndex((i) => Math.max(0, i - 1))
    } else if (event.name === "down") {
      setRemoveDepIndex((i) => Math.min(detail.dependsOn.length - 1, i + 1))
    } else if (event.name === "return") {
      const dep = detail.dependsOn[removeDepIndex]
      if (dep) {
        try {
          removeDependency(db, detail.id, dep.id)
          setDependencyError("")
        } catch (error) {
          setDependencyError(error instanceof Error ? error.message : "Failed to remove dependency")
        }
      }
      setShowDependencyRemover(false)
    } else if (event.name === "escape") {
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
              setDependencyError(error instanceof Error ? error.message : "Failed to add dependency")
            }
            setShowDependencyPicker(false)
          }}
          onCancel={() => setShowDependencyPicker(false)}
        />
      ) : showDependencyRemover ? (
        <box flexDirection="column" backgroundColor={theme.bg_1} paddingX={2} paddingY={1}>
          <text attributes={TextAttributes.BOLD} fg={theme.yellow}>Remove Dependency</text>

          <box marginTop={1} flexDirection="column">
            {detail.dependsOn.map((dep, i) => (
              <box key={dep.id}>
                <text
                  fg={i === removeDepIndex ? theme.bg_1 : getStatusColor(dep.status)}
                  bg={i === removeDepIndex ? getStatusColor(dep.status) : undefined}
                >
                  {i === removeDepIndex ? "▸ " : "  "}
                  {dep.title.substring(0, 45)} [{STATUS_LABELS[dep.status as Status] || dep.status}]
                </text>
              </box>
            ))}
          </box>

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
              [e]dit  [s]tatus  [p]riority  [d]elete  {!detail.parentId && "[A]dd subtask  "}[c]opy id  [+]dep  [-]dep  [Esc]back  ↑↓ scroll
            </text>
          </box>
        </box>
      )}
    </box>
  )
}

// ── Section line types ──────────────────────────────────────────────

interface LineData {
  type: "heading" | "field" | "dep" | "subtask" | "history" | "blank" | "text" | "blocked-banner"
  label?: string
  value?: string
  color?: string
  bold?: boolean
  dimmed?: boolean
  status?: string
  done?: boolean
}

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
        <box>
          <text fg={theme.dim_0}>{line.label}: </text>
          <text fg={line.color ?? theme.fg_1} attributes={line.bold ? TextAttributes.BOLD : TextAttributes.NONE}>{line.value}</text>
        </box>
      )
    case "dep":
      return (
        <box>
          <text fg={theme.fg_1}>{line.label === "depends_on" ? "  → " : "  ← "}</text>
          <text fg={theme.fg_1}>{line.value}</text>
          <text fg={theme.dim_0}> </text>
          <text fg={getStatusColor(line.status || "")}>[{STATUS_LABELS[line.status as Status] || line.status}]</text>
        </box>
      )
    case "subtask":
      return (
        <box>
          <text fg={theme.fg_1}>  {line.done ? "[x]" : "[ ]"} </text>
          <text fg={line.done ? theme.dim_0 : theme.fg_1}>{line.value}</text>
        </box>
      )
    case "history":
      return (
        <box>
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
    case "blank":
      return <box><text> </text></box>
    default:
      return null
  }
}

// ── Build section data ──────────────────────────────────────────────

function buildSections(detail: TaskDetailType): LineData[] {
  const lines: LineData[] = []

  // Basic info
  lines.push({ type: "field", label: "Title", value: detail.title, bold: true })
  lines.push({ type: "field", label: "ID", value: detail.id, dimmed: true })
  lines.push({
    type: "field",
    label: "Status",
    value: STATUS_LABELS[detail.status as Status] || detail.status,
    color: getStatusColor(detail.status),
  })
  lines.push({
    type: "field",
    label: "Priority",
    value: PRIORITY_LABELS[detail.priority as Priority] || detail.priority,
    color: getPriorityColor(detail.priority),
  })
  if (detail.type) {
    lines.push({
      type: "field",
      label: "Type",
      value: TASK_TYPE_LABELS[detail.type as TaskType] || detail.type,
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
  const blockerCount = detail.dependsOn.filter((d) => d.status !== "done" && d.status !== "in_review").length
  if (blockerCount > 0) {
    lines.push({ type: "blank" })
    lines.push({ type: "blocked-banner", value: String(blockerCount) })
  }

  // Description
  if (detail.description) {
    lines.push({ type: "blank" })
    lines.push({ type: "heading", label: "Description" })
    // Word-wrap long descriptions to fit terminal width
    const wrapWidth = Math.max(20, (process.stdout.columns || 80) - 10)
    const wrapped = wordWrap(detail.description, wrapWidth)
    for (const wl of wrapped) {
      lines.push({ type: "text", value: wl })
    }
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
      const fromLabel = h.fromStatus ? (STATUS_LABELS[h.fromStatus as Status] || h.fromStatus) : "—"
      const toLabel = STATUS_LABELS[h.toStatus as Status] || h.toStatus
      lines.push({
        type: "history",
        label: formatDateTime(h.changedAt),
        value: `${fromLabel} → ${toLabel}`,
      })
    }
  }

  return lines
}

// ── Utility functions ───────────────────────────────────────────────

function formatDate(date: Date | string | number | null | undefined): string {
  if (!date) return "—"
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

function formatDateTime(date: Date | string | number | null | undefined): string {
  if (!date) return "—"
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function wordWrap(text: string, maxWidth: number): string[] {
  const lines: string[] = []
  // Replace tab characters with spaces — tabs render as garbled boxes
  const paragraphs = text.replace(/\t/g, "    ").split("\n")
  for (const para of paragraphs) {
    if (para.length <= maxWidth) {
      lines.push(para)
      continue
    }
    const words = para.split(" ")
    let current = ""
    for (const word of words) {
      // Force-break words that are longer than maxWidth
      if (word.length > maxWidth) {
        if (current) {
          lines.push(current)
          current = ""
        }
        for (let i = 0; i < word.length; i += maxWidth) {
          lines.push(word.slice(i, i + maxWidth))
        }
        continue
      }
      if (current.length + word.length + 1 > maxWidth) {
        lines.push(current)
        current = word
      } else {
        current = current ? `${current} ${word}` : word
      }
    }
    if (current) lines.push(current)
  }
  return lines
}
