import React from "react"
import type { ErrorInfo, ReactNode } from "react"
import { TextAttributes } from "@opentui/core"
import { theme } from "../lib/theme.js"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to stderr so it doesn't interfere with the TUI
    process.stderr.write(
      `[vault0] Uncaught error: ${error.message}\n${error.stack}\nComponent stack: ${errorInfo.componentStack}\n`,
    )
  }

  render() {
    if (this.state.hasError) {
      return (
        <box
          flexDirection="column"
          paddingX={2}
          paddingY={1}
          backgroundColor={theme.bg_1}
        >
          <text attributes={TextAttributes.BOLD} fg="red">
            Vault0 Encountered an Error
          </text>
          <box marginTop={1}>
            <text>{this.state.error?.message || "Unknown error"}</text>
          </box>
          <box marginTop={1}>
            <text fg={theme.dim_0}>
              Press Ctrl+C to exit. Check stderr output for details.
            </text>
          </box>
        </box>
      )
    }

    return this.props.children
  }
}
