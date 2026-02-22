import React, { useState, useRef, useCallback } from "react"
import { Box, Text, useInput } from "ink"
import type { Task, Status, Priority, TaskType, TaskDetail as TaskDetailType } from "../lib/types.js"
import { useDb } from "../lib/db-context.js"
import { getTaskDetail, addDependency, removeDependency } from "../db/queries.js"
import { STATUS_LABELS, PRIORITY_LABELS, TASK_TYPE_LABELS } from "../lib/constants.js"
import { getPriorityColor, getStatusColor, getTaskTypeColor } from "../lib/theme.js"
import { theme } from "../lib/theme.js"
import { copyToClipboard } from "../lib/clipboard.js"
import { DependencyPicker } from "./DependencyPicker.js"

export interface TaskDetailProps {
  taskId: string
  onBack: () => void
  onEdit: (task: Task) => void
  onStatusPick: (task: Task) => void
  onCyclePriority: (taskId: string) => void
  onDelete: (taskId: string) => void
  onCreateSubtask: (parent: Task) => void
}

export function TaskDetail({
  taskId,
  onBack,
  onEdit,
  onStatusPick,
  onCyclePriority,
  onDelete,
  onCreateSubtask,
}: TaskDetailProps) {
  const db = useDb()
  const [scrollOffset, setScrollOffset] = useState(0)
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

  // Fetch fresh detail data on every render (sync DB, no caching needed)
  let detail: TaskDetailType
  try {
    detail = getTaskDetail(db, taskId)
  } catch {
    return (
      <Box flexDirection="column" backgroundColor={theme.bg_1} paddingX={2} paddingY={1}>
        <Text color={theme.red}>Task not found (may have been archived)</Text>
        <Box marginTop={1}>
          <Text color={theme.dim_0}>Press Esc to go back</Text>
        </Box>
      </Box>
    )
  }

  // Build content lines for scrollable display
  // (detail is re-queried from sync DB on every render — no caching needed)
  const sections = buildSections(detail)

  // Total overhead = App Header (3) + TaskDetail chrome (8) = 11 lines.
  //
  // App Header: content rows(2) + marginBottom(1) = 3
  // TaskDetail: paddingY(2) + title(1) + scroll-up(1) +
  //             content margin(1) + scroll-down(1) + footer margin(1) + footer(1) = 8
  //
  // IMPORTANT: maxVisible is ALWAYS rows-11, regardless of whether scrolling
  // is needed. This prevents a feedback loop where showing/hiding scroll
  // indicators changes the viewport size, which changes whether indicators
  // are needed, causing content to oscillate between renders. The cost is
  // 2 unused lines when content fits without scrolling — negligible.
  const rows = process.stdout.rows || 24
  const totalLines = sections.length
  const maxVisible = Math.max(1, rows - 11)
  const clampedOffset = Math.min(scrollOffset, Math.max(0, totalLines - maxVisible))

  const visibleLines = sections.slice(clampedOffset, clampedOffset + maxVisible)

  useInput((input, key) => {
    if (key.escape) {
      onBack()
    } else if (input === "e") {
      onEdit(detail)
    } else if (input === "s") {
      onStatusPick(detail)
    } else if (input === "p") {
      onCyclePriority(detail.id)
    } else if (input === "d") {
      onDelete(detail.id)
      onBack()
    } else if (input === "A") {
      // Only allow adding subtasks to top-level tasks (not subtasks of subtasks)
      if (!detail.parentId) {
        onCreateSubtask(detail)
      }
    } else if (input === "c") {
      const ok = copyToClipboard(detail.id)
      showCopyToast(ok ? `Copied: ${detail.id}` : "Copy failed")
    } else if (input === "+") {
      setShowDependencyPicker(true)
      setDependencyError("")
    } else if (input === "-" && detail.dependsOn.length > 0) {
      setShowDependencyRemover(true)
      setRemoveDepIndex(0)
      setDependencyError("")
    } else if (key.upArrow) {
      setScrollOffset((prev) => Math.max(0, prev - 1))
    } else if (key.downArrow) {
      setScrollOffset((prev) => Math.min(Math.max(0, totalLines - maxVisible), prev + 1))
    } else if (key.pageUp) {
      setScrollOffset((prev) => Math.max(0, prev - maxVisible))
    } else if (key.pageDown) {
      setScrollOffset((prev) => Math.min(Math.max(0, totalLines - maxVisible), prev + maxVisible))
    }
  }, { isActive: !showDependencyPicker && !showDependencyRemover })

  // Dependency removal overlay input handler
  useInput((_input, key) => {
    if (key.upArrow) {
      setRemoveDepIndex((i) => Math.max(0, i - 1))
    } else if (key.downArrow) {
      setRemoveDepIndex((i) => Math.min(detail.dependsOn.length - 1, i + 1))
    } else if (key.return) {
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
    } else if (key.escape) {
      setShowDependencyRemover(false)
    }
  }, { isActive: showDependencyRemover })

  const hasMore = totalLines > maxVisible

  // Render callback for visible scroll lines.
  // Keys include the scroll offset so React unmounts/remounts every SectionLine
  // when the viewport shifts. This prevents Ink's terminal diff from corrupting
  // output when in-place content changes (text length changes cause ghost
  // characters, structural changes between line types cause layout glitches).
  // This matches the pattern used by HelpOverlay's absolute-index keys.
  const renderSlot = (line: LineData, slot: number) => (
    <SectionLine key={`${clampedOffset}-${slot}`} line={line} />
  )

  return (
    <Box flexDirection="column" width="100%">
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
        <Box flexDirection="column" backgroundColor={theme.bg_1} paddingX={2} paddingY={1}>
          <Text bold color={theme.yellow}>Remove Dependency</Text>

          <Box marginTop={1} flexDirection="column">
            {detail.dependsOn.map((dep, i) => (
              <Box key={dep.id}>
                <Text
                  color={getStatusColor(dep.status)}
                  inverse={i === removeDepIndex}
                >
                  {i === removeDepIndex ? "▸ " : "  "}
                  {dep.title.substring(0, 45)} [{STATUS_LABELS[dep.status as Status] || dep.status}]
                </Text>
              </Box>
            ))}
          </Box>

          <Box marginTop={1}>
            <Text color={theme.dim_0}>↑/↓: navigate  Enter: remove  Esc: cancel</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" backgroundColor={theme.bg_1} paddingX={2} paddingY={1} width="100%">
          {/* Header */}
          <Box justifyContent="center">
            <Text bold color={theme.blue}>Task Detail</Text>
          </Box>

          {/* Scroll-up indicator — always render the slot to keep constant
              output height and prevent React reconciliation churn */}
          <Box justifyContent="flex-end">
            {hasMore && clampedOffset > 0
              ? <Text color={theme.dim_0}>↑ {clampedOffset} more</Text>
              : <Text> </Text>}
          </Box>

          {/* Content — keys include the scroll offset so React creates fresh
              SectionLine instances on each scroll step. This avoids Ink terminal
              diff artifacts (ghost characters, corrupted values) that occur when
              updating slot content in-place with varying text lengths/structures. */}
          <Box flexDirection="column" marginTop={1}>
            {visibleLines.map(renderSlot)}
          </Box>

          {/* Scroll-down indicator — always render the slot to keep constant
              output height and prevent React reconciliation churn */}
          <Box justifyContent="flex-end">
            {hasMore && clampedOffset + maxVisible < totalLines
              ? <Text color={theme.dim_0}>↓ {totalLines - clampedOffset - maxVisible} more</Text>
              : <Text> </Text>}
          </Box>

          {/* Dependency error */}
          {dependencyError && (
            <Box marginTop={1}>
              <Text color={theme.red}>⚠ {dependencyError}</Text>
            </Box>
          )}

          {/* Copy toast */}
          {copyToast && (
            <Box marginTop={dependencyError ? 0 : 1}>
              <Text color={theme.green} bold>✓ {copyToast}</Text>
            </Box>
          )}

          {/* Footer shortcuts */}
          <Box marginTop={1} justifyContent="center">
            <Text color={theme.dim_0}>
              [e]dit  [s]tatus  [p]riority  [d]elete  {!detail.parentId && "[A]dd subtask  "}[c]opy id  [+]dep  [-]dep  [Esc]back  ↑↓ scroll
            </Text>
          </Box>
        </Box>
      )}
    </Box>
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
        <Box>
          <Text bold color={theme.blue}>── {line.label} ──</Text>
        </Box>
      )
    case "field":
      return (
        <Box>
          <Text color={theme.dim_0}>{line.label}: </Text>
          <Text color={line.color ?? theme.fg_1} bold={line.bold}>{line.value}</Text>
        </Box>
      )
    case "dep":
      return (
        <Box>
          <Text color={theme.fg_1}>{line.label === "depends_on" ? "  → " : "  ← "}</Text>
          <Text color={theme.fg_1}>{line.value}</Text>
          <Text color={theme.dim_0}> </Text>
          <Text color={getStatusColor(line.status || "")}>[{STATUS_LABELS[line.status as Status] || line.status}]</Text>
        </Box>
      )
    case "subtask":
      return (
        <Box>
          <Text color={theme.fg_1}>  {line.done ? "[x]" : "[ ]"} </Text>
          <Text color={line.done ? theme.dim_0 : theme.fg_1}>{line.value}</Text>
        </Box>
      )
    case "history":
      return (
        <Box>
          <Text color={theme.dim_0}>  {line.label}  </Text>
          <Text color={theme.fg_1}>{line.value}</Text>
        </Box>
      )
    case "blocked-banner":
      return (
        <Box>
          <Text color={theme.red} bold>🔒 Blocked — waiting on {line.value} {Number(line.value) === 1 ? "dependency" : "dependencies"}</Text>
        </Box>
      )
    case "text":
      return (
        <Box>
          <Text color={line.dimmed ? theme.dim_0 : (line.color ?? theme.fg_1)}>{line.value}</Text>
        </Box>
      )
    case "blank":
      return <Box><Text> </Text></Box>
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
  const blockerCount = detail.dependsOn.filter((d) => d.status !== "done").length
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
  const paragraphs = text.split("\n")
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
