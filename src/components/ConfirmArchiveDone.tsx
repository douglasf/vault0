import { theme } from "../lib/theme.js"
import { ConfirmDialog } from "./ConfirmDialog.js"

export interface ConfirmArchiveDoneProps {
  /** Number of done tasks that will be archived. */
  doneCount: number
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation modal for bulk-archiving all tasks in the Done column.
 */
export function ConfirmArchiveDone({ doneCount, onConfirm, onCancel }: ConfirmArchiveDoneProps) {
  return (
    <ConfirmDialog title="Archive Done Lane" onConfirm={onConfirm} onCancel={onCancel}>
      <box marginTop={0} flexDirection="column">
        <text fg={theme.fg_1}>
          Archive all {doneCount} task{doneCount !== 1 ? "s" : ""} in the Done column?
        </text>
        <box marginTop={1}>
          <text fg={theme.dim_0}>Archived tasks can be viewed using the "Show Archived" filter (f).</text>
        </box>
      </box>
    </ConfirmDialog>
  )
}
