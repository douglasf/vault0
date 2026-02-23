import type { KeyEvent } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { theme } from "../lib/theme.js"
import { TextAttributes } from "@opentui/core"
import { ModalOverlay } from "./ModalOverlay.js"

export interface ConfirmArchiveDoneProps {
  doneCount: number
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmArchiveDone({ doneCount, onConfirm, onCancel }: ConfirmArchiveDoneProps) {
  useKeyboard((event: KeyEvent) => {
    const input = event.raw || ""
    if (input === "y" || input === "Y") {
      onConfirm()
    } else if (input === "n" || input === "N") {
      onCancel()
    }
  })

  return (
    <ModalOverlay onClose={onCancel} size="small">
      <text fg={theme.yellow} attributes={TextAttributes.BOLD}>Archive Done Lane</text>

      <box marginTop={1} flexDirection="column">
        <text fg={theme.fg_1}>
          Archive all {doneCount} task{doneCount !== 1 ? "s" : ""} in the Done column?
        </text>
        <box marginTop={1}>
          <text fg={theme.dim_0}>Archived tasks can be viewed using the "Show Archived" filter (f).</text>
        </box>
      </box>

      <box marginTop={1}>
        <text fg={theme.dim_0}>[y]es  [n]o / Esc: cancel</text>
      </box>
    </ModalOverlay>
  )
}
