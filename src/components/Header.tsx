import type React from "react"
import { Box, Text } from "ink"
import type { Filters } from "../lib/types.js"
import { useDb } from "../lib/db-context.js"
import { getBoard } from "../db/queries.js"
import { useGitStatus } from "../hooks/useGitStatus.js"

export interface HeaderProps {
  boardId: string
  filters: Filters
  activeFilterCount?: number
}

export function Header({ boardId, filters, activeFilterCount = 0 }: HeaderProps) {
  const db = useDb()
  const gitStatus = useGitStatus()

  // Resolve board name from ID (sync DB lookup — fast)
  let boardName = "Loading..."
  if (boardId) {
    try {
      const board = getBoard(db, boardId)
      boardName = board?.name || boardId
    } catch {
      boardName = boardId
    }
  }

  // Color helpers for git status parts
  const renderGitStatus = () => {
    if (!gitStatus.isRepo) {
      return <Text bold>Vault0</Text>
    }

    const parts: React.ReactNode[] = [
      <Text key="brand" bold>Vault0</Text>,
      <Text key="sep" dimColor> — </Text>,
      <Text key="branch" color="cyan" bold>{gitStatus.branch}</Text>,
    ]

    // File change indicators
    const changes: React.ReactNode[] = []
    if (gitStatus.staged > 0) {
      changes.push(<Text key="staged" color="green">+{gitStatus.staged}</Text>)
    }
    if (gitStatus.modified > 0) {
      changes.push(<Text key="modified" color="yellow">~{gitStatus.modified}</Text>)
    }
    if (gitStatus.untracked > 0) {
      changes.push(<Text key="untracked" color="gray">?{gitStatus.untracked}</Text>)
    }

    if (changes.length > 0) {
      parts.push(<Text key="change-sep"> </Text>)
      for (const node of changes) {
        parts.push(node)
      }
    }

    // Remote tracking indicators
    const remote: React.ReactNode[] = []
    if (gitStatus.ahead > 0) {
      remote.push(<Text key="ahead" color="green">↑{gitStatus.ahead}</Text>)
    }
    if (gitStatus.behind > 0) {
      remote.push(<Text key="behind" color="red">↓{gitStatus.behind}</Text>)
    }

    if (remote.length > 0) {
      parts.push(<Text key="remote-sep"> </Text>)
      for (const node of remote) {
        parts.push(node)
      }
    }

    // If working tree is clean and synced, show a checkmark
    if (changes.length === 0 && remote.length === 0) {
      parts.push(<Text key="clean" color="green"> ✓</Text>)
    }

    return <>{parts}</>
  }

  return (
    <Box flexDirection="column" width="100%" marginBottom={1} borderStyle="round" borderColor="gray">
      <Box justifyContent="center">
        {renderGitStatus()}
      </Box>
      <Box justifyContent="space-between" paddingX={1}>
        <Text dimColor>{boardName}</Text>
        <Box>
          {filters.showArchived && (
            <Text color="yellow" bold> ⌫ archived </Text>
          )}
          {activeFilterCount > 0 && (
            <Text color="cyan" bold> {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active </Text>
          )}
        </Box>
        <Text dimColor>f filter | r ready | b blocked | ? help | q quit</Text>
      </Box>
    </Box>
  )
}
