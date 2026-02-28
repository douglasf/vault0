import { useState, useCallback } from "react"

export interface UseNavigationOptions {
  columnCount: number
  rowCounts: number[] // rowCounts[colIndex] = number of tasks in that column
  initialColumn?: number
  initialRow?: number
}

export interface UseNavigationResult {
  selectedColumn: number
  selectedRow: number
  navigateLeft: () => void
  navigateRight: () => void
  navigateUp: () => void
  navigateDown: () => void
  navigateUpBy: (n: number) => void
  navigateDownBy: (n: number) => void
  navigateToColumn: (col: number) => void
  navigateTo: (col: number, row: number) => void
  selectCurrent: () => { column: number; row: number } | null
}

export function useNavigation(options: UseNavigationOptions): UseNavigationResult {
  // Combined position state avoids stale closures when column and row
  // need to update atomically (e.g. clamping row when switching columns)
  const [position, setPosition] = useState({
    column: options.initialColumn ?? 0,
    row: options.initialRow ?? 0,
  })

  const getMaxRow = useCallback(
    (col: number) => Math.max(0, (options.rowCounts[col] ?? 0) - 1),
    [options.rowCounts]
  )

  const navigateLeft = useCallback(() => {
    setPosition((prev) => {
      const newCol = Math.max(0, prev.column - 1)
      const maxRow = getMaxRow(newCol)
      return { column: newCol, row: Math.min(prev.row, maxRow) }
    })
  }, [getMaxRow])

  const navigateRight = useCallback(() => {
    setPosition((prev) => {
      const newCol = Math.min(options.columnCount - 1, prev.column + 1)
      const maxRow = getMaxRow(newCol)
      return { column: newCol, row: Math.min(prev.row, maxRow) }
    })
  }, [options.columnCount, getMaxRow])

  const navigateUpBy = useCallback((n: number) => {
    setPosition((prev) => ({
      ...prev,
      row: Math.max(0, prev.row - n),
    }))
  }, [])

  const navigateUp = useCallback(() => navigateUpBy(1), [navigateUpBy])

  const navigateDownBy = useCallback((n: number) => {
    setPosition((prev) => {
      const maxRow = getMaxRow(prev.column)
      return { ...prev, row: Math.min(maxRow, prev.row + n) }
    })
  }, [getMaxRow])

  const navigateDown = useCallback(() => navigateDownBy(1), [navigateDownBy])

  const navigateToColumn = useCallback(
    (col: number) => {
      setPosition((prev) => {
        const newCol = Math.max(0, Math.min(options.columnCount - 1, col))
        const maxRow = getMaxRow(newCol)
        return { column: newCol, row: Math.min(prev.row, maxRow) }
      })
    },
    [options.columnCount, getMaxRow]
  )

  const navigateTo = useCallback(
    (col: number, row: number) => {
      const newCol = Math.max(0, Math.min(options.columnCount - 1, col))
      const maxRow = getMaxRow(newCol)
      setPosition({ column: newCol, row: Math.min(row, maxRow) })
    },
    [options.columnCount, getMaxRow]
  )

  const selectCurrent = useCallback(() => {
    const maxRow = getMaxRow(position.column)
    if ((options.rowCounts[position.column] ?? 0) > 0 && position.row <= maxRow) {
      return { column: position.column, row: position.row }
    }
    return null
  }, [position, getMaxRow, options.rowCounts])

  return {
    selectedColumn: position.column,
    selectedRow: position.row,
    navigateLeft,
    navigateRight,
    navigateUp,
    navigateDown,
    navigateUpBy,
    navigateDownBy,
    navigateToColumn,
    navigateTo,
    selectCurrent,
  }
}
