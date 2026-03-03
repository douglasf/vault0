import React from "react"
import type { ErrorInfo, ReactNode } from "react"
import { TextAttributes } from "@opentui/core"
import { theme } from "../lib/theme.js"

// ── Types ──────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional callback invoked when an error is caught (for external logging/telemetry). */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

// ── Component ──────────────────────────────────────────────────────

/**
 * Top-level error boundary that catches unhandled React render errors
 * and displays a fallback UI instead of crashing the TUI.
 *
 * Errors are logged to stderr so they don't interfere with the terminal UI.
 * Users must restart vault0 to recover from render errors.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const timestamp = new Date().toISOString()
    process.stderr.write(
      `[vault0 ${timestamp}] Uncaught error: ${error.message}\n` +
      `${error.stack ?? "(no stack)"}\n` +
      `Component stack: ${errorInfo.componentStack}\n`,
    )
    this.props.onError?.(error, errorInfo)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const message = this.state.error?.message || "Unknown error"

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
            <text fg={theme.fg_0}>{message}</text>
          </box>
          <box marginTop={1}>
            <text fg={theme.dim_0}>
              Press Ctrl+C to exit, or try restarting vault0.
            </text>
          </box>
          <box marginTop={0}>
            <text fg={theme.dim_0}>
              Check stderr output for full error details.
            </text>
          </box>
        </box>
      )
    }

    return this.props.children
  }
}
