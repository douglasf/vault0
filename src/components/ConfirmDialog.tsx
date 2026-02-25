import type { ReactNode } from "react"
import { theme } from "../lib/theme.js"
import { ModalOverlay } from "./ModalOverlay.js"
import { Button } from "./Button.js"

export interface ConfirmDialogProps {
  title: string
  onConfirm: () => void
  onCancel: () => void
  children: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  confirmColor?: string
  cancelColor?: string
}

/**
 * Generic confirmation dialog with standardized button row.
 * Wraps content in a small ModalOverlay with Yes/No buttons bound to y/n hotkeys.
 */
export function ConfirmDialog({
  title,
  onConfirm,
  onCancel,
  children,
  confirmLabel = "Yes",
  cancelLabel = "No",
  confirmColor = theme.green,
  cancelColor = theme.red,
}: ConfirmDialogProps) {
  return (
    <ModalOverlay onClose={onCancel} size="small" title={title}>
      {children}

      <box marginX={1} marginTop={1} flexDirection="row" justifyContent="flex-end" gap={1}>
        <Button
          onPress={onConfirm}
          hotkey="y"
          bg={confirmColor}
          label={confirmLabel} />
        <Button
          onPress={onCancel}
          hotkey="n"
          bg={cancelColor}
          label={cancelLabel} />
      </box>
    </ModalOverlay>
  )
}
