import React from "react"
import { TextAttributes } from "@opentui/core"
import { theme } from "../lib/theme.js"

export function EmptyBoard() {
  return (
    <box
      flexDirection="column"
      width="100%"
      flexGrow={1}
      justifyContent="center"
      alignItems="center"
    >
      <box flexDirection="column" alignItems="center">
        <box marginBottom={1}>
          <ascii-font text="vault0" font="tiny" color={theme.fg_0} />
        </box>
        <text attributes={TextAttributes.BOLD} fg={theme.yellow}>
          No tasks yet
        </text>
        <box marginTop={1}>
          <text fg={theme.dim_0}>Press 'a' to create your first task</text>
        </box>
        <box marginTop={1}>
          <text fg={theme.dim_0}>Press '?' for help</text>
        </box>
      </box>
    </box>
  )
}
