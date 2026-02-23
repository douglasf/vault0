import { useState } from "react"
import type { KeyEvent } from "@opentui/core"
import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import type { Status, Task } from "../lib/types.js"
import { STATUS_LABELS, VISIBLE_STATUSES } from "../lib/constants.js"
import { getStatusColor } from "../lib/theme.js"
import { theme } from "../lib/theme.js"
import { ModalOverlay } from "./ModalOverlay.js"

export interface StatusPickerProps {
  task: Task
  onSelectStatus: (status: Status) => void
  onCancel: () => void
}

export function StatusPicker({ task, onSelectStatus, onCancel }: StatusPickerProps) {
  const currentIndex = VISIBLE_STATUSES.indexOf(task.status as Status)
  const [selectedIndex, setSelectedIndex] = useState(currentIndex >= 0 ? currentIndex : 0)

  useKeyboard((event: KeyEvent) => {
    if (event.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (event.name === "down") {
      setSelectedIndex((i) => Math.min(VISIBLE_STATUSES.length - 1, i + 1))
    } else if (event.name === "return") {
      onSelectStatus(VISIBLE_STATUSES[selectedIndex])
    }
  })

  return (
    <ModalOverlay onClose={onCancel} size="medium">
      <text fg={theme.cyan} attributes={TextAttributes.BOLD} truncate={true}>Move Task: {task.title}</text>

      {VISIBLE_STATUSES.map((status, i) => {
        const isSelected = i === selectedIndex
        const isCurrent = status === task.status
        const statusColor = getStatusColor(status)
        const attrs = isCurrent ? TextAttributes.BOLD : TextAttributes.NONE
        return (
          <box key={status} marginTop={i === 0 ? 1 : 0}>
            <text
              fg={isSelected ? theme.bg_1 : statusColor}
              bg={isSelected ? statusColor : undefined}
              attributes={attrs}
            >
              {isSelected ? "▸ " : "  "}
              {STATUS_LABELS[status]}
              {isCurrent ? " (current)" : ""}
            </text>
          </box>
        )
      })}

      <box marginTop={1}>
        <text fg={theme.dim_0}>↑/↓: navigate  Enter: select  Esc: cancel</text>
      </box>
    </ModalOverlay>
  )
}
