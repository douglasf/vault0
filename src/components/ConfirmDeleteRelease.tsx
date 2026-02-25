import { TextAttributes } from "@opentui/core"
import type { ReleaseWithTaskCount } from "../lib/types.js"
import { theme } from "../lib/theme.js"
import { truncateText } from "../lib/format.js"
import { ConfirmDialog } from "./ConfirmDialog.js"

export interface ConfirmDeleteReleaseProps {
  release: ReleaseWithTaskCount
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDeleteRelease({ release, onConfirm, onCancel }: ConfirmDeleteReleaseProps) {
  const truncatedName = truncateText(release.name, 50)

  return (
    <ConfirmDialog title="Delete Release" onConfirm={onConfirm} onCancel={onCancel}>
      <box marginTop={0} flexDirection="column">
        <text fg={theme.fg_1}>
          Delete release and restore all tasks to the board?
        </text>
        <box marginTop={1}>
          <text fg={theme.dim_0}>Release: </text>
          <text fg={theme.fg_1} attributes={TextAttributes.BOLD}>{truncatedName}</text>
        </box>
        <box marginTop={0}>
          <text fg={theme.dim_0}>Tasks: </text>
          <text fg={theme.fg_1}>{release.taskCount} task{release.taskCount !== 1 ? "s" : ""} will be restored</text>
        </box>
        <box marginTop={1}>
          <text fg={theme.red}>This will permanently remove the release record.</text>
        </box>
      </box>
    </ConfirmDialog>
  )
}
