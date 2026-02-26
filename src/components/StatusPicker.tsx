import { useEffect, useRef } from "react"
import type { ScrollBoxRenderable, SelectOption } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
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
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const { height: terminalRows } = useTerminalDimensions()

  // Modal chrome: 4 (modal margin) + 2 (padding) + 1 (title) = 7
  // Scrollbox marginTop: 1
  // Bottom area outside scrollbox: 1 (spacer) + 1 (footer) = 2
  const chromeHeight = 7 + 1 + 2
  const contentHeight = selectOptions.length
  const availableHeight = Math.max(3, terminalRows - chromeHeight)
  const needsScroll = contentHeight > availableHeight
  const scrollHeight = needsScroll ? availableHeight : contentHeight

  // ── Auto-scroll to show initially selected status ──────────────────
  useEffect(() => {
    if (!scrollRef.current) return
    const itemBottom = initialIndex + 1
    if (itemBottom > scrollHeight) {
      scrollRef.current.scrollTo(itemBottom - scrollHeight)
    }
  }, [initialIndex, scrollHeight])

  return (
    <ModalOverlay onClose={onCancel} size="medium" title={`Move Task: ${task.title}`}>
      <scrollbox ref={scrollRef} scrollY focused={false} flexGrow={0} flexShrink={1} marginTop={1} height={scrollHeight}>
        <select
          options={selectOptions}
          focused={true}
          height={selectOptions.length}
          selectedIndex={initialIndex}
          showDescription={false}
          backgroundColor={theme.bg_1}
          selectedBackgroundColor={getStatusColor(task.status as Status)}
          selectedTextColor={theme.bg_1}
          textColor={theme.fg_0}
          onSelect={(_index: number, option: SelectOption | null) => {
            if (option?.value) {
              onSelectStatus(option.value as Status)
            }
          }}
        />
      </scrollbox>

      <box marginTop={1}>
        <text fg={theme.dim_0}>↑/↓: navigate  Enter: select  Esc: cancel</text>
      </box>
    </ModalOverlay>
  )
}
