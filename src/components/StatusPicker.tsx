import type { SelectOption } from "@opentui/core"
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

const selectOptions: SelectOption[] = VISIBLE_STATUSES.map((status) => ({
  name: STATUS_LABELS[status],
  description: "",
  value: status,
}))

export function StatusPicker({ task, onSelectStatus, onCancel }: StatusPickerProps) {
  const currentIndex = VISIBLE_STATUSES.indexOf(task.status as Status)
  const initialIndex = currentIndex >= 0 ? currentIndex : 0

  return (
    <ModalOverlay onClose={onCancel} size="medium" title={`Move Task: ${task.title}`}>
      <select
        marginTop={1}
        options={selectOptions}
        selectedIndex={initialIndex}
        selectedBackgroundColor={getStatusColor(task.status as Status)}
        selectedTextColor={theme.bg_1}
        textColor={theme.fg_0}
        onSelect={(_index: number, option: SelectOption | null) => {
          if (option?.value) {
            onSelectStatus(option.value as Status)
          }
        }}
      />

      <box marginTop={1}>
        <text fg={theme.dim_0}>↑/↓: navigate  Enter: select  Esc: cancel</text>
      </box>
    </ModalOverlay>
  )
}
