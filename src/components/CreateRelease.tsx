import { useState, useCallback, useMemo, useRef } from "react"
import { TextAttributes } from "@opentui/core"
import type { ScrollBoxRenderable, SelectOption, InputRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useKeybindScope } from "../hooks/useKeybindScope.js"
import { useKeybind } from "../hooks/useKeybind.js"
import { SCOPE_PRIORITY } from "../lib/keybind-registry.js"
import type { Task } from "../lib/types.js"
import type { DetectedVersionFile } from "../lib/version-detect.js"
import { theme } from "../lib/theme.js"
import { useFormNavigation } from "../hooks/useFormNavigation.js"
import { ModalOverlay } from "./ModalOverlay.js"
import { FormInput } from "./FormInput.js"
import { Button } from "./Button.js"

export interface CreateReleaseData {
  name: string
  description: string
  taskIds: string[]
  /** If set, bump version in this file to the new version */
  versionBump?: { file: string; path: string; oldVersion: string; newVersion: string }
}

export interface CreateReleaseProps {
  /** Top-level done tasks eligible for the release (no subtasks) */
  doneTasks: Task[]
  /** All board tasks (for subtask lookup and validation) */
  allBoardTasks: Task[]
  /** Detected version files in the project */
  versionFiles: DetectedVersionFile[]
  onSubmit: (data: CreateReleaseData) => void
  onCancel: () => void
}

type FormField = "name" | "description" | "version-bump" | "version-value" | "tasks" | "submit"

const SPACE_SELECT_BINDING = [{ name: "space", action: "select-current" as const }]

/**
 * Modal dialog for creating a new release.
 *
 * Shows a name input, optional description, optional version bump toggle,
 * and a select list of done tasks to include in the release.
 */
export function CreateRelease({ doneTasks, allBoardTasks, versionFiles, onSubmit, onCancel }: CreateReleaseProps) {
  const nameRef = useRef<InputRenderable>(null)
  const descRef = useRef<InputRenderable>(null)
  const versionRef = useRef<InputRenderable>(null)
  const scrollRef = useRef<ScrollBoxRenderable>(null)

  const { height: terminalRows } = useTerminalDimensions()
  // Modal chrome: 4 (modal margin) + 2 (padding) + 1 (title) = 7
  // Bottom area outside scrollbox: 1 (spacer) + 1 (validation) + 1 (submit) + 1 (margin) = 4
  const chromeHeight = 7 + 4

  // ── Field heights for scroll calculation ───────────────────────────────
  // Each field uses marginBottom={1} for consistent spacing
  const FIELD_HEIGHT = useMemo(() => ({
    name: 2,            // FormInput box(1) + marginBottom(1)
    description: 2,     // FormInput box(1) + marginBottom(1)
    "version-bump": 2,  // toggle text(1) + marginBottom(1)
    "version-value": 2, // FormInput box(1) + marginBottom(1)
    tasks: 1 + Math.min(doneTasks.length, 8) + 1, // header(1) + select(min(n,8)) + marginBottom(1)
    "no-tasks": 2,      // text(1) + marginBottom(1)
  }), [doneTasks.length])

  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    () => new Set(doneTasks.map((t) => t.id)),
  )
  const [bumpVersion, setBumpVersion] = useState(false)
  const [selectedVersionFileIdx, setSelectedVersionFileIdx] = useState(0)
  const [versionValue, setVersionValue] = useState("")
  const [validationError, setValidationError] = useState<string | null>(null)

  const hasVersionFiles = versionFiles.length > 0
  const selectedVersionFile = hasVersionFiles ? versionFiles[selectedVersionFileIdx] : null

  // Build field list dynamically based on whether version files exist
  const fields = useMemo<FormField[]>(() => {
    const f: FormField[] = ["name", "description"]
    if (hasVersionFiles) {
      f.push("version-bump")
      if (bumpVersion) f.push("version-value")
    }
    if (doneTasks.length > 0) f.push("tasks")
    f.push("submit")
    return f
  }, [hasVersionFiles, bumpVersion, doneTasks.length])

  const { focusField, setFocusField, advance, retreat, isFocused } = useFormNavigation(fields, "name" as FormField)

  // ── Adaptive scroll height (shrink-to-content) ─────────────────────────
  let contentHeight = 0
  for (const f of fields) {
    if (f === "submit") continue
    contentHeight += FIELD_HEIGHT[f as keyof typeof FIELD_HEIGHT] ?? 0
  }
  // If no tasks field but we still show "no done tasks" text
  if (!fields.includes("tasks")) contentHeight += FIELD_HEIGHT["no-tasks"]
  const availableHeight = Math.max(5, terminalRows - chromeHeight)
  const needsScroll = contentHeight > availableHeight
  const scrollHeight = needsScroll ? availableHeight : contentHeight

  // ── Auto-scroll to keep focused field visible ──────────────────────────
  const scrollToField = useCallback(
    (field: FormField) => {
      if (!scrollRef.current || !scrollHeight) return
      let fieldTop = 0
      for (const f of fields) {
        if (f === field) break
        fieldTop += FIELD_HEIGHT[f as keyof typeof FIELD_HEIGHT] ?? 0
      }
      const fh = FIELD_HEIGHT[field as keyof typeof FIELD_HEIGHT] ?? 0
      const fieldBottom = fieldTop + fh
      const currentScroll = scrollRef.current.scrollTop
      if (fieldTop < currentScroll) {
        scrollRef.current.scrollTo(fieldTop)
      } else if (fieldBottom > currentScroll + scrollHeight) {
        scrollRef.current.scrollTo(fieldBottom - scrollHeight)
      }
    },
    [fields, scrollHeight, FIELD_HEIGHT],
  )

  // Scroll when focus changes
  scrollToField(focusField)

  const handleSubmit = useCallback(() => {
    const name = nameRef.current?.value?.trim() || ""
    if (!name) return

    // Validate: all selected tasks and their subtasks must be done
    const errors: string[] = []
    for (const taskId of selectedTaskIds) {
      const task = doneTasks.find((t) => t.id === taskId)
      if (!task) continue
      if (task.status !== "done") {
        errors.push(`Task "${task.title}" has status ${task.status} — all work must be complete`)
      }
      const subtasks = allBoardTasks.filter((t) => t.parentId === taskId)
      for (const sub of subtasks) {
        if (sub.status !== "done") {
          errors.push(`Task "${task.title}" has subtask "${sub.title}" with status ${sub.status} — all work must be complete`)
        }
      }
    }
    if (errors.length > 0) {
      setValidationError(errors[0])
      return
    }
    setValidationError(null)

    const data: CreateReleaseData = {
      name,
      description: descRef.current?.value?.trim() || "",
      taskIds: Array.from(selectedTaskIds),
    }

    if (bumpVersion && selectedVersionFile && versionValue.trim()) {
      data.versionBump = {
        file: selectedVersionFile.file,
        path: selectedVersionFile.path,
        oldVersion: selectedVersionFile.version,
        newVersion: versionValue.trim(),
      }
    }

    onSubmit(data)
  }, [selectedTaskIds, bumpVersion, selectedVersionFile, versionValue, onSubmit, doneTasks, allBoardTasks])

  const toggleTask = useCallback((taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }, [])

  const toggleAllTasks = useCallback(() => {
    setSelectedTaskIds((prev) => {
      if (prev.size === doneTasks.length) {
        return new Set()
      }
      return new Set(doneTasks.map((t) => t.id))
    })
  }, [doneTasks])

  const makeTaskOptions = useCallback((): SelectOption[] => {
    return doneTasks.map((task) => {
      const isSelected = selectedTaskIds.has(task.id)
      const subtaskCount = allBoardTasks.filter((t) => t.parentId === task.id).length
      const suffix = subtaskCount > 0 ? ` (+${subtaskCount} subtask${subtaskCount !== 1 ? "s" : ""})` : ""
      return {
        name: `${isSelected ? "●" : "○"} ${task.title}${suffix}`,
      description: "",
        value: task.id,
      }
    })
  }, [doneTasks, selectedTaskIds, allBoardTasks])

  const handleTaskSelect = useCallback((_index: number, option: SelectOption | null) => {
    if (option?.value) toggleTask(option.value)
  }, [toggleTask])

  const scope = useKeybindScope("create-release", {
    priority: SCOPE_PRIORITY.WIDGET,
    opaque: false,
  })

  // ── Form navigation ────────────────────────────────────────────────────
  useKeybind(scope, "Tab", advance, { description: "Next field" })
  useKeybind(scope, "Shift+Tab", retreat, { description: "Previous field" })

  // ── Field-specific: name ───────────────────────────────────────────────
  useKeybind(scope, "Enter", advance, {
    when: focusField === "name",
    description: "Advance from name",
  })

  // ── Field-specific: version-bump ───────────────────────────────────────
  useKeybind(scope, ["Enter", "Space"], useCallback(() => {
    const newBump = !bumpVersion
    setBumpVersion(newBump)
    if (newBump && selectedVersionFile) {
      setVersionValue(selectedVersionFile.version)
    }
  }, [bumpVersion, selectedVersionFile]), {
    when: focusField === "version-bump",
    description: "Toggle version bump",
  })
  useKeybind(scope, "ArrowLeft", useCallback(() => {
    if (versionFiles.length > 1) {
      const newIdx = (selectedVersionFileIdx - 1 + versionFiles.length) % versionFiles.length
      setSelectedVersionFileIdx(newIdx)
      if (bumpVersion) setVersionValue(versionFiles[newIdx].version)
    }
  }, [versionFiles, selectedVersionFileIdx, bumpVersion]), {
    when: focusField === "version-bump",
    description: "Previous version file",
  })
  useKeybind(scope, "ArrowRight", useCallback(() => {
    if (versionFiles.length > 1) {
      const newIdx = (selectedVersionFileIdx + 1) % versionFiles.length
      setSelectedVersionFileIdx(newIdx)
      if (bumpVersion) setVersionValue(versionFiles[newIdx].version)
    }
  }, [versionFiles, selectedVersionFileIdx, bumpVersion]), {
    when: focusField === "version-bump",
    description: "Next version file",
  })

  // ── Field-specific: version-value ──────────────────────────────────────
  useKeybind(scope, "Enter", advance, {
    when: focusField === "version-value",
    description: "Advance from version value",
  })

  // ── Field-specific: tasks ──────────────────────────────────────────────
  // ── Field-specific: submit ──────────────────────────────────────────────
  useKeybind(scope, "Enter", handleSubmit, {
    when: focusField === "submit",
    description: "Submit release",
  })

  // ── Field-specific: tasks ──────────────────────────────────────────────
  useKeybind(scope, "a", toggleAllTasks, {
    when: focusField === "tasks",
    description: "Toggle all tasks",
  })

  return (
    <ModalOverlay onClose={onCancel} size="large" title="Create Release">
      <box flexDirection="column">
        <scrollbox ref={scrollRef} scrollY focused={false} flexGrow={0} flexShrink={1} height={scrollHeight}>
          <box flexDirection="column" flexGrow={0} flexShrink={0}>
            {/* Release name */}
            <FormInput
              ref={nameRef}
              focused={isFocused("name")}
              onMouseDown={() => setFocusField("name")}
              placeholder="e.g. v1.0.0, Sprint 3, January Release"
              onSubmit={advance}
            />

            {/* Description (optional) */}
            <FormInput
              ref={descRef}
              focused={isFocused("description")}
              onMouseDown={() => setFocusField("description")}
              placeholder="Description (optional)"
              onSubmit={advance}
            />

            {/* Version bump toggle */}
            {hasVersionFiles && (
              <box height={1} marginBottom={1}>
                <text onMouseDown={() => setFocusField("version-bump")}>
                  <span fg={isFocused("version-bump") ? theme.blue : theme.fg_0}>
                    {isFocused("version-bump") ? "\u25B8 " : "  "}
                    Bump version?{" "}
                  </span>
                  <span fg={bumpVersion ? theme.green : theme.dim_0}>
                    [{bumpVersion ? "x" : " "}]
                  </span>
                  <span fg={theme.dim_0}>
                    {" "}{selectedVersionFile?.file} (current: {selectedVersionFile?.version})
                    {versionFiles.length > 1 ? " \u25C0\u25B6" : ""}
                  </span>
                </text>
              </box>
            )}

            {/* Version value input */}
            {bumpVersion && selectedVersionFile && (
              <FormInput
                ref={versionRef}
                focused={isFocused("version-value")}
                onMouseDown={() => setFocusField("version-value")}
                value={versionValue}
                onInput={(v: string) => setVersionValue(v)}
                onSubmit={advance}
              />
            )}

            {/* Task selector */}
            {doneTasks.length > 0 && (
              <box flexDirection="column" marginBottom={1}>
                <text attributes={TextAttributes.BOLD} fg={isFocused("tasks") ? theme.blue : theme.fg_0}>
                  Tasks ({selectedTaskIds.size}/{doneTasks.length} selected)
                  {isFocused("tasks") ? "  [a] toggle all" : ""}
                </text>
                <select
                  options={makeTaskOptions()}
                  focused={isFocused("tasks")}
                  height={Math.min(doneTasks.length, 8)}
                  showDescription={false}
                  onSelect={handleTaskSelect}
                  onMouseDown={() => setFocusField("tasks")}
                  keyBindings={SPACE_SELECT_BINDING}
                  textColor={theme.fg_0}
                  selectedTextColor={theme.fg_1}
                  selectedBackgroundColor={theme.bg_2}
                  backgroundColor={theme.bg_1}
                />
              </box>
            )}

            {doneTasks.length === 0 && (
              <box height={1} marginBottom={1}>
                <text fg={theme.dim_0}>  No done tasks to include in release.</text>
              </box>
            )}
          </box>
        </scrollbox>

        {/* Submit button — always visible outside scrollbox */}
        {validationError && (
          <text fg={theme.red}>  ⚠ {validationError}</text>
        )}
        <box minHeight={3} marginX={1} alignItems="flex-start" onMouseDown={() => setFocusField("submit")}>
          <Button
            onPress={handleSubmit}
            fg={isFocused("submit") ? theme.blue : theme.fg_0}
            label="Submit" />
        </box>
      </box>
    </ModalOverlay>
  )
}
