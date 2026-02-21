import { useState, useCallback, useEffect, useRef } from "react"
import { useStdin, type Key } from "ink"

export interface TextInputResult {
  /** Current text value */
  value: string
  /** Cursor position (index in the string) */
  cursor: number
  /** Handle a key input event. Returns true if the key was consumed. */
  handleInput: (input: string, key: Key) => boolean
  /** Text before the cursor */
  beforeCursor: string
  /** Text from cursor onwards */
  afterCursor: string
  /** Lines of text (split by \n) */
  lines: string[]
  /** Which line the cursor is on (0-indexed) */
  cursorLine: number
  /** Column position on the cursor's line */
  cursorCol: number
}

/**
 * Terminal-like text editing hook with cursor navigation and shortcuts.
 *
 * NOTE on Ink key mapping (v6):
 * On macOS, the physical Backspace key sends \x7f (ASCII 127). Ink maps this
 * to `key.delete = true`, NOT `key.backspace = true`. The `key.backspace` flag
 * only triggers for \b (ASCII 8, i.e. Ctrl+H). The real Forward Delete key
 * (Fn+Backspace on Mac) sends \x1b[3~ which Ink also maps to `key.delete = true`.
 * To distinguish them, we capture the raw stdin sequence via `useStdin` and check
 * whether it's \x1b[3~ (forward-delete) or \x7f (backward-delete).
 *
 * Navigation:
 * - Left/Right arrows: move cursor by character
 * - Ctrl+Left / Alt+Left: move by word backward
 * - Ctrl+Right / Alt+Right: move by word forward
 * - Up/Down arrows (multiline): move between lines
 * - Home / Ctrl+A: go to start of line
 * - End / Ctrl+E: go to end of line
 *
 * Editing:
 * - Backspace: delete character before cursor (backward-delete)
 * - Delete / Ctrl+D: delete character at cursor (forward-delete)
 * - Ctrl+U: clear from start of line to cursor
 * - Ctrl+K: clear from cursor to end of line
 * - Ctrl+W: delete word before cursor
 * - Enter (multiline): insert newline
 */
export function useTextInput(initialValue = "", multiline = false): TextInputResult {
  const [state, setState] = useState({ value: initialValue, cursor: initialValue.length })
  const { internal_eventEmitter } = useStdin()

  // Capture the raw stdin sequence so we can distinguish physical Backspace
  // (\x7f) from physical Delete (\x1b[3~) — Ink maps both to key.delete.
  const lastRawRef = useRef("")

  useEffect(() => {
    const capture = (data: string | Buffer) => {
      lastRawRef.current = typeof data === "string" ? data : String(data)
    }
    internal_eventEmitter?.on("input", capture)
    return () => {
      internal_eventEmitter?.removeListener("input", capture)
    }
  }, [internal_eventEmitter])

  const handleInput = useCallback((input: string, key: Key): boolean => {
    // Backward-delete: delete char before cursor.
    // key.backspace fires for \b (Ctrl+H). key.delete fires for BOTH \x7f
    // (physical Backspace on macOS) and \x1b[3~ (physical Delete). We check
    // the raw stdin sequence to distinguish them.
    if (key.backspace || (key.delete && !isForwardDeleteSequence(lastRawRef.current))) {
      setState(prev => {
        if (prev.cursor === 0) return prev
        return {
          value: prev.value.slice(0, prev.cursor - 1) + prev.value.slice(prev.cursor),
          cursor: prev.cursor - 1,
        }
      })
      return true
    }

    // Forward-delete: delete char at cursor (physical Delete / Fn+Backspace on Mac).
    // Detected by the raw stdin sequence \x1b[3~ and its shift/ctrl/kitty variants.
    if (key.delete && isForwardDeleteSequence(lastRawRef.current)) {
      setState(prev => {
        if (prev.cursor >= prev.value.length) return prev
        return {
          ...prev,
          value: prev.value.slice(0, prev.cursor) + prev.value.slice(prev.cursor + 1),
        }
      })
      return true
    }

    // Left arrow
    if (key.leftArrow) {
      setState(prev => {
        if (key.ctrl || key.meta) {
          return { ...prev, cursor: findPrevWordBoundary(prev.value, prev.cursor) }
        }
        return { ...prev, cursor: Math.max(0, prev.cursor - 1) }
      })
      return true
    }

    // Right arrow
    if (key.rightArrow) {
      setState(prev => {
        if (key.ctrl || key.meta) {
          return { ...prev, cursor: findNextWordBoundary(prev.value, prev.cursor) }
        }
        return { ...prev, cursor: Math.min(prev.value.length, prev.cursor + 1) }
      })
      return true
    }

    // Home key: go to start of line
    if (key.home) {
      setState(prev => {
        if (!multiline) return { ...prev, cursor: 0 }
        const info = getCursorInfo(prev)
        return { ...prev, cursor: getAbsolutePosition(info.lines, info.cursorLine, 0) }
      })
      return true
    }

    // End key: go to end of line
    if (key.end) {
      setState(prev => {
        if (!multiline) return { ...prev, cursor: prev.value.length }
        const info = getCursorInfo(prev)
        return {
          ...prev,
          cursor: getAbsolutePosition(info.lines, info.cursorLine, info.lines[info.cursorLine].length),
        }
      })
      return true
    }

    // Up arrow (multiline only — move to previous line)
    if (key.upArrow && multiline) {
      setState(prev => {
        const info = getCursorInfo(prev)
        if (info.cursorLine === 0) return prev
        const targetLine = info.cursorLine - 1
        const targetCol = Math.min(info.cursorCol, info.lines[targetLine].length)
        return { ...prev, cursor: getAbsolutePosition(info.lines, targetLine, targetCol) }
      })
      return true
    }

    // Down arrow (multiline only — move to next line)
    if (key.downArrow && multiline) {
      setState(prev => {
        const info = getCursorInfo(prev)
        if (info.cursorLine >= info.lines.length - 1) return prev
        const targetLine = info.cursorLine + 1
        const targetCol = Math.min(info.cursorCol, info.lines[targetLine].length)
        return { ...prev, cursor: getAbsolutePosition(info.lines, targetLine, targetCol) }
      })
      return true
    }

    // Enter in multiline mode: insert newline
    if (key.return && multiline) {
      setState(prev => ({
        value: `${prev.value.slice(0, prev.cursor)}\n${prev.value.slice(prev.cursor)}`,
        cursor: prev.cursor + 1,
      }))
      return true
    }

    // Ctrl shortcuts
    if (key.ctrl) {
      switch (input) {
        case "a": // Go to start of line (or start of text in single-line)
          setState(prev => {
            if (!multiline) return { ...prev, cursor: 0 }
            const info = getCursorInfo(prev)
            return { ...prev, cursor: getAbsolutePosition(info.lines, info.cursorLine, 0) }
          })
          return true

        case "e": // Go to end of line (or end of text in single-line)
          setState(prev => {
            if (!multiline) return { ...prev, cursor: prev.value.length }
            const info = getCursorInfo(prev)
            return {
              ...prev,
              cursor: getAbsolutePosition(info.lines, info.cursorLine, info.lines[info.cursorLine].length),
            }
          })
          return true

        case "d": // Forward-delete: delete char at cursor (Ctrl+D, same as Delete key)
          setState(prev => {
            if (prev.cursor >= prev.value.length) return prev
            return {
              ...prev,
              value: prev.value.slice(0, prev.cursor) + prev.value.slice(prev.cursor + 1),
            }
          })
          return true

        case "u": // Clear from start of line to cursor
          setState(prev => {
            if (!multiline) return { value: prev.value.slice(prev.cursor), cursor: 0 }
            const info = getCursorInfo(prev)
            const lineStart = getAbsolutePosition(info.lines, info.cursorLine, 0)
            return {
              value: prev.value.slice(0, lineStart) + prev.value.slice(prev.cursor),
              cursor: lineStart,
            }
          })
          return true

        case "k": // Clear from cursor to end of line
          setState(prev => {
            if (!multiline) return { ...prev, value: prev.value.slice(0, prev.cursor) }
            const info = getCursorInfo(prev)
            const lineEnd = getAbsolutePosition(
              info.lines,
              info.cursorLine,
              info.lines[info.cursorLine].length,
            )
            return {
              ...prev,
              value: prev.value.slice(0, prev.cursor) + prev.value.slice(lineEnd),
            }
          })
          return true

        case "w": // Delete word before cursor
          setState(prev => {
            const newCursor = findPrevWordBoundary(prev.value, prev.cursor)
            if (newCursor === prev.cursor) return prev
            return {
              value: prev.value.slice(0, newCursor) + prev.value.slice(prev.cursor),
              cursor: newCursor,
            }
          })
          return true

        default:
          return false
      }
    }

    // Regular character input (not ctrl, not meta)
    if (input && !key.meta) {
      setState(prev => ({
        value: prev.value.slice(0, prev.cursor) + input + prev.value.slice(prev.cursor),
        cursor: prev.cursor + input.length,
      }))
      return true
    }

    return false
  }, [multiline])

  // Compute derived rendering values
  const { value, cursor } = state
  const beforeCursor = value.slice(0, cursor)
  const afterCursor = value.slice(cursor)
  const { lines, cursorLine, cursorCol } = getCursorInfo(state)

  return {
    value,
    cursor,
    handleInput,
    beforeCursor,
    afterCursor,
    lines,
    cursorLine,
    cursorCol,
  }
}

// ── Helper functions ────────────────────────────────────────────────

/** Compute cursor line and column from state */
function getCursorInfo(state: { value: string; cursor: number }) {
  const lines = state.value.split("\n")
  let pos = 0
  for (let i = 0; i < lines.length; i++) {
    if (state.cursor <= pos + lines[i].length) {
      return { lines, cursorLine: i, cursorCol: state.cursor - pos }
    }
    pos += lines[i].length + 1 // +1 for the \n separator
  }
  // Fallback: cursor at end of last line
  return { lines, cursorLine: lines.length - 1, cursorCol: lines[lines.length - 1].length }
}

/** Get absolute string position from line index and column */
function getAbsolutePosition(lines: string[], lineIndex: number, col: number): number {
  let pos = 0
  for (let i = 0; i < lineIndex; i++) {
    pos += lines[i].length + 1 // +1 for \n
  }
  return pos + col
}

/** Find position of previous word boundary (skip whitespace, then skip word chars) */
function findPrevWordBoundary(text: string, cursor: number): number {
  let pos = cursor
  // Skip whitespace before cursor
  while (pos > 0 && /\s/.test(text[pos - 1])) pos--
  // Skip word characters
  while (pos > 0 && /\S/.test(text[pos - 1])) pos--
  return pos
}

/** Find position of next word boundary (skip word chars, then skip whitespace) */
function findNextWordBoundary(text: string, cursor: number): number {
  let pos = cursor
  // Skip non-whitespace at cursor
  while (pos < text.length && /\S/.test(text[pos])) pos++
  // Skip whitespace
  while (pos < text.length && /\s/.test(text[pos])) pos++
  return pos
}

/**
 * Check if the raw stdin sequence corresponds to the forward-Delete key.
 *
 * Standard:  \x1b[3~      Shift-Delete: \x1b[3$    Ctrl-Delete: \x1b[3^
 * Modifier:  \x1b[3;2~    Kitty enhanced: \x1b[3;1:1~
 *
 * All forward-delete variants start with ESC [ 3 followed by ~ $ ^ or ;
 * This is distinct from Backspace which produces \x7f or \x1b\x7f.
 */
function isForwardDeleteSequence(raw: string): boolean {
  // ESC (0x1b) followed by "[3" then one of ~ $ ^ ;
  return raw.length >= 4 && raw.charCodeAt(0) === 0x1b && raw[1] === "[" && raw[2] === "3"
}
