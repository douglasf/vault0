import type { SelectOption } from "@opentui/core"
import type { Task } from "../lib/types.js"
import { getStatusLabel, truncateText } from "../lib/format.js"
import { theme } from "../lib/theme.js"
import { ModalOverlay } from "./ModalOverlay.js"

export interface DependencyRemoverProps {
  dependencyList: Task[]
  onSelect: (depId: string) => void
  onCancel: () => void
}

/**
 * Modal overlay for selecting and removing a dependency from a task.
 * Displays a list of current dependencies with status labels.
 */
export function DependencyRemover({ dependencyList, onSelect, onCancel }: DependencyRemoverProps) {
  return (
    <ModalOverlay size="medium" title="Remove Dependency" onClose={onCancel}>
      <select
        focused={true}
        width={55}
        height={Math.min(dependencyList.length * 2, 16)}
        showDescription={false}
        options={dependencyList.map((dep) => ({
          name: `${truncateText(dep.title, 45)} [${getStatusLabel(dep.status)}]`,
          description: "",
          value: dep.id,
        }))}
        selectedBackgroundColor={theme.yellow}
        selectedTextColor={theme.bg_1}
        textColor={theme.fg_1}
        backgroundColor={theme.bg_1}
        onSelect={(_index: number, option: SelectOption | null) => {
          if (option?.value) {
            onSelect(option.value)
          } else {
            onCancel()
          }
        }}
      />

      <box marginTop={1}>
        <text fg={theme.dim_0}>↑/↓: navigate  Enter: remove  Esc: cancel</text>
      </box>
    </ModalOverlay>
  )
}
