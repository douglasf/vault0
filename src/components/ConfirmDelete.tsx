import { TextAttributes } from "@opentui/core"
import type { Task } from "../lib/types.js"
import { theme } from "../lib/theme.js"
import { truncateText } from "../lib/format.js"
import { ConfirmDialog } from "./ConfirmDialog.js"

export interface ConfirmDeleteProps {
  task: Task
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDelete({ task, onConfirm, onCancel }: ConfirmDeleteProps) {
  const truncatedTitle = truncateText(task.title, 50)
  const isHardDelete = task.archivedAt !== null

  return (
    <ConfirmDialog
      title={isHardDelete ? "Permanently Delete Task" : "Archive Task"}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <box marginTop={0} flexDirection="column">
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
    </ConfirmDialog>
  )
}
