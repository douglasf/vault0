import type { KeyEvent } from "@opentui/core"
import { useActiveKeyboard } from "../hooks/useActiveKeyboard.js"
import { theme } from "../lib/theme.js"
import { ModalOverlay } from "./ModalOverlay.js"

export interface ConfirmArchiveDoneProps {
  /** Number of done tasks that will be archived. */
  doneCount: number
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation modal for bulk-archiving all tasks in the Done column.
 * Accepts y/Y to confirm and n/N/Esc to cancel.
 */
export function ConfirmArchiveDone({ doneCount, onConfirm, onCancel }: ConfirmArchiveDoneProps) {
  useActiveKeyboard((event: KeyEvent) => {
    const input = event.raw || ""
    if (input === "y" || input === "Y") {
      onConfirm()
    } else if (input === "n" || input === "N") {
      onCancel()
    }
  })

  return (
    <ModalOverlay onClose={onCancel} size="small" title="Archive Done Lane">
      <box marginTop={0} flexDirection="column">
        <text fg={theme.fg_1}>
          Archive all {doneCount} task{doneCount !== 1 ? "s" : ""} in the Done column?
        </text>
        <box marginTop={1}>
          <text fg={theme.dim_0}>Archived tasks can be viewed using the "Show Archived" filter (f).</text>
        </box>
      </box>

      <box marginTop={1}>
        <text fg={theme.fg_1}>[y]es  [n]o / Esc: cancel</text>
      </box>
    </ModalOverlay>
  )
}
