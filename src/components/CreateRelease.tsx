import { useState, useCallback, useMemo, useRef } from "react"
import { TextAttributes } from "@opentui/core"
import type { KeyEvent, SelectOption } from "@opentui/core"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"
import type { Task } from "../lib/types.js"
import type { DetectedVersionFile } from "../lib/version-detect.js"
import { theme } from "../lib/theme.js"
import { useFormNavigation } from "../hooks/useFormNavigation.js"
import { ModalOverlay } from "./ModalOverlay.js"
import { FormInput } from "./FormInput.js"
import type { FormInputHandle } from "./FormInput.js"
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
  const nameRef = useRef<FormInputHandle>(null)
  const descRef = useRef<FormInputHandle>(null)
  const versionRef = useRef<FormInputHandle>(null)

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

  const handleSubmit = useCallback(() => {
    const name = nameRef.current?.input?.value?.trim() || ""
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
      description: descRef.current?.input?.value?.trim() || "",
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

  useActiveKeyboard((event: KeyEvent) => {
    // Tab / Shift+Tab navigation
    if (event.name === "tab") {
      if (event.shift) {
        retreat()
      } else {
        advance()
      }
      return
    }

    // Field-specific handling
    if (focusField === "name" && event.name === "return") {
      advance()
      return
    }

    if (focusField === "version-bump") {
      if (event.name === "return" || event.raw === " ") {
        const newBump = !bumpVersion
        setBumpVersion(newBump)
        if (newBump && selectedVersionFile) {
          setVersionValue(selectedVersionFile.version)
        }
        return
      }
      if (event.name === "left" || event.name === "right") {
        // Cycle through version files if multiple
        if (versionFiles.length > 1) {
          const delta = event.name === "right" ? 1 : -1
          const newIdx = (selectedVersionFileIdx + delta + versionFiles.length) % versionFiles.length
          setSelectedVersionFileIdx(newIdx)
          if (bumpVersion) {
            setVersionValue(versionFiles[newIdx].version)
          }
        }
        return
      }
    }

    if (focusField === "version-value" && event.name === "return") {
      advance()
      return
    }

    if (focusField === "tasks") {
      if (event.raw === "a") {
        toggleAllTasks()
        return
      }
    }
  })

  return (
    <ModalOverlay onClose={onCancel} size="large" title="Create Release">
      <box flexDirection="column">
        {/* Release name */}
        <text> </text>
        <FormInput
          ref={nameRef}
          label="Release Name"
          focused={isFocused("name")}
          onFocus={() => setFocusField("name")}
          placeholder="e.g. v1.0.0, Sprint 3, January Release"
          onSubmit={advance}
        />

        {/* Description (optional) */}
        <text> </text>
        <FormInput
          ref={descRef}
          label="Description (optional)"
          focused={isFocused("description")}
          onFocus={() => setFocusField("description")}
          onSubmit={advance}
        />

        {/* Version bump toggle */}
        {hasVersionFiles && (
          <>
            <text> </text>
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
          </>
        )}

        {/* Version value input */}
        {bumpVersion && selectedVersionFile && (
          <>
            <text> </text>
            <FormInput
              ref={versionRef}
              label="New Version"
              focused={isFocused("version-value")}
              onFocus={() => setFocusField("version-value")}
              value={versionValue}
              onInput={(v: string) => setVersionValue(v)}
              onSubmit={advance}
            />
          </>
        )}

        {/* Task selector */}
        {doneTasks.length > 0 && (
          <>
            <text> </text>
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
          </>
        )}

        {doneTasks.length === 0 && (
          <>
            <text> </text>
            <text fg={theme.dim_0}>  No done tasks to include in release.</text>
          </>
        )}

        {/* Submit button */}
        <text> </text>
        {validationError && (
          <text fg={theme.red}>  ⚠ {validationError}</text>
        )}
        <box marginX={1} alignItems="flex-end" onMouseDown={() => setFocusField("submit")}>
          <Button
            onPress={handleSubmit}
            fg={isFocused("submit") ? theme.blue : theme.fg_0}
            label="Submit" />
        </box>
      </box>
    </ModalOverlay>
  )
}
