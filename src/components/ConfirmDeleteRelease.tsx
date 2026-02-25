import { TextAttributes } from "@opentui/core"
import type { ReleaseWithTaskCount } from "../lib/types.js"
import { theme } from "../lib/theme.js"
import { ModalOverlay } from "./ModalOverlay.js"
import { Button } from "./Button.js"

export interface ConfirmDeleteReleaseProps {
  release: ReleaseWithTaskCount
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDeleteRelease({ release, onConfirm, onCancel }: ConfirmDeleteReleaseProps) {
  const truncatedName = release.name.length > 50
    ? `${release.name.substring(0, 47)}...`
    : release.name

  return (
    <ModalOverlay onClose={onCancel} size="small" title="Delete Release">
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

      <box marginX={1} marginTop={1} flexDirection="row" justifyContent="flex-end" gap={1}>
        <Button
          onPress={onConfirm}
          hotkey="y"
          bg={theme.green}
          label="Yes" />
        <Button
          onPress={onCancel}
          hotkey="n"
          bg={theme.red}
          label="No" />
      </box>
    </ModalOverlay>
  )
}
