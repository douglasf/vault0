import React from "react"
import type { ErrorInfo, ReactNode } from "react"
import { Box, Text } from "ink"
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
        <Box
          flexDirection="column"
          paddingX={2}
          paddingY={1}
          backgroundColor={theme.bg_1}
        >
          <Text bold color="red">
            Vault0 Encountered an Error
          </Text>
          <Box marginTop={1}>
            <Text>{this.state.error?.message || "Unknown error"}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.dim_0}>
              Press Ctrl+C to exit. Check stderr output for details.
            </Text>
          </Box>
        </Box>
      )
    }

    return this.props.children
  }
}
