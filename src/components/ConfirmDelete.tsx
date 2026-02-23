import { useState } from "react"
import type { KeyEvent } from "@opentui/core"
import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import type { Task } from "../lib/types.js"
import { theme } from "../lib/theme.js"
import { ModalOverlay } from "./ModalOverlay.js"

export interface ConfirmDeleteProps {
  task: Task
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDelete({ task, onConfirm, onCancel }: ConfirmDeleteProps) {
  useKeyboard((event: KeyEvent) => {
    const input = event.raw || ""
    if (input === "y" || input === "Y") {
      onConfirm()
    } else if (input === "n" || input === "N") {
      onCancel()
    }
  })

  const truncatedTitle = task.title.length > 50
    ? `${task.title.substring(0, 47)}...`
    : task.title

  const isHardDelete = task.archivedAt !== null

  return (
    <ModalOverlay onClose={onCancel} size="small">
      <text fg={theme.red} attributes={TextAttributes.BOLD}>{isHardDelete ? "Permanently Delete Task" : "Archive Task"}</text>

      <box marginTop={1} flexDirection="column">
        {isHardDelete ? (
          <>
            <text fg={theme.fg_1}>Do you want to permanently delete this task?</text>
            <text fg={theme.red} attributes={TextAttributes.BOLD}>This action is irreversible.</text>
          </>
        ) : (
          <text fg={theme.fg_1}>Are you sure you want to archive this task?</text>
        )}
        <box marginTop={1}>
          <text fg={theme.dim_0}>Task: </text>
          <text fg={theme.fg_1} attributes={TextAttributes.BOLD}>{truncatedTitle}</text>
        </box>
      </box>

      <box marginTop={1}>
        <text fg={theme.fg_1}>[y]es  [n]o / Esc: cancel</text>
      </box>
    </ModalOverlay>
  )
}
