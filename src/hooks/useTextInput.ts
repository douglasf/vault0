import { useState, useCallback, useEffect, useRef } from "react"
import { useStdin, type Key } from "ink"

// ── Token types ─────────────────────────────────────────────────────

/**
 * A token represents a segment of text input.
 * - 'text': user-typed content (editable, cursor can enter)
 * - 'paste': multi-line pasted content (atomic, cursor skips over)
 */
export type Token = {
  type: "text" | "paste"
  content: string
}

/** Internal state: tokens are the source of truth */
type TokenState = {
  tokens: Token[]
  /** Always points to a 'text' token (invariant) */
  cursorTokenIndex: number
  /** Character offset within the cursor's text token */
  cursorCharOffset: number
}

export interface TextInputResult {
  /** Current text value (reconstructed from all tokens) */
  value: string
  /** Cursor position (flat index in the reconstructed string) */
  cursor: number
  /** Handle a key input event. Returns true if the key was consumed. */
  handleInput: (input: string, key: Key) => boolean
  /** Text before the cursor (in the flat value) */
  beforeCursor: string
  /** Text from cursor onwards (in the flat value) */
  afterCursor: string
  /** Lines of the flat value (split by \n) */
  lines: string[]
  /** Which line the cursor is on (0-indexed, in the flat value) */
  cursorLine: number
  /** Column position on the cursor's line (in the flat value) */
  cursorCol: number
  /** Token array — the authoritative representation of the input */
  tokens: Token[]
  /** Index of the token the cursor is in (always a 'text' token) */
  cursorTokenIndex: number
  /** Character offset within the cursor's token */
  cursorCharOffset: number
  /** Which logical line the cursor is on within its text token (0-indexed) */
  tokenCursorLine: number
  /** Column position within the cursor's text-token line */
  tokenCursorCol: number
  /**
   * @deprecated Use `tokens` instead. True when any paste token exists.
   */
  pastedMultiline: boolean
  /**
   * @deprecated Use `tokens` instead. Content of all paste tokens joined.
   */
  pastedContent: string
}

/**
 * Terminal-like text editing hook with cursor navigation, shortcuts,
 * and tokenized paste handling.
 *
 * The input is stored as an array of tokens: user-typed 'text' tokens
 * and atomic 'paste' tokens. The cursor is always inside a text token.
 * Paste tokens are skipped during navigation and deleted atomically.
 *
 * INVARIANT: The token array always starts and ends with a text token.
 * Text and paste tokens alternate: [text, paste, text, paste, …, text].
 * Empty text tokens are allowed (they serve as cursor anchors between pastes).
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
 * - Left/Right arrows: move cursor by character; skip paste tokens at boundaries
 * - Ctrl+Left / Alt+Left: move by word backward (within text token, then skip paste)
 * - Ctrl+Right / Alt+Right: move by word forward (within text token, then skip paste)
 * - Up/Down arrows (multiline): move between lines, crossing paste token boundaries
 * - Home / Ctrl+A: go to start of line (multiline) or start of input (single-line)
 * - End / Ctrl+E: go to end of line (multiline) or end of input (single-line)
 *
 * Editing:
 * - Backspace: delete char; at text token start, delete preceding paste token atomically
 * - Delete / Ctrl+D: delete char; at text token end, delete following paste token atomically
 * - Ctrl+U: clear from start of line to cursor (within text token)
 * - Ctrl+K: clear from cursor to end of line (within text token)
 * - Ctrl+W: delete word before cursor; at text token start, delete preceding paste token
 * - Enter (multiline): insert newline into text token
 * - Paste (multi-char with newlines): create atomic paste token
 */
export function useTextInput(initialValue = "", multiline = false): TextInputResult {
  const [state, setState] = useState<TokenState>({
    tokens: [{ type: "text", content: initialValue }],
    cursorTokenIndex: 0,
    cursorCharOffset: initialValue.length,
  })

  const { internal_eventEmitter } = useStdin()

  // Capture the raw stdin sequence so we can distinguish physical Backspace
  // (\x7f) from physical Delete (\x1b[3~) — Ink maps both to key.delete.
  const lastRawRef = useRef("")
  // Bracketed-paste buffer: when non-null, we're collecting chunks between
  // ESC[200~ and ESC[201~ into a single string before creating a paste token.
  const pasteBufferRef = useRef<string | null>(null)

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
    // ── Bracketed paste buffering ─────────────────────────────────────
    // Terminals send ESC[200~ before pasted content and ESC[201~ after.
    // Ink strips the ESC, so we receive "[200~" and "[201~" as input.
    // Buffer ALL content between these markers, then create a single
    // paste token — this prevents the first line from leaking as text.
    if (input === "[200~") {
      // Guard: if a previous paste buffer is still open (lost [201~]),
      // flush it before starting a new one so content isn't silently lost.
      if (pasteBufferRef.current !== null && pasteBufferRef.current.length > 0) {
        const stale = pasteBufferRef.current
        const sanitized = stale.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
        if (multiline && sanitized.includes("\n")) {
          setState(prev => insertPaste(prev, sanitized))
        } else if (sanitized) {
          setState(prev => insertText(prev, sanitized))
        }
      }
      pasteBufferRef.current = ""
      return true
    }
    if (input === "[201~") {
      const buffered = pasteBufferRef.current
      pasteBufferRef.current = null
      if (buffered) {
        const sanitized = buffered.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
        if (multiline && sanitized.includes("\n")) {
          setState(prev => insertPaste(prev, sanitized))
        } else if (sanitized) {
          setState(prev => insertText(prev, sanitized))
        }
      }
      return true
    }
    if (pasteBufferRef.current !== null) {
      pasteBufferRef.current += input
      return true
    }

    // Backward-delete: delete char before cursor (or entire preceding paste token).
    if (key.backspace || (key.delete && !isForwardDeleteSequence(lastRawRef.current))) {
      setState(prev => backwardDelete(prev))
      return true
    }

    // Forward-delete: delete char at cursor (or entire following paste token).
    if (key.delete && isForwardDeleteSequence(lastRawRef.current)) {
      setState(prev => forwardDelete(prev))
      return true
    }

    // Left arrow
    if (key.leftArrow) {
      setState(prev => moveLeft(prev, key.ctrl || key.meta))
      return true
    }

    // Right arrow
    if (key.rightArrow) {
      setState(prev => moveRight(prev, key.ctrl || key.meta))
      return true
    }

    // Home key
    if (key.home) {
      setState(prev => moveHome(prev, multiline))
      return true
    }

    // End key
    if (key.end) {
      setState(prev => moveEnd(prev, multiline))
      return true
    }

    // Up arrow (multiline only — move to previous line, crossing paste boundaries)
    if (key.upArrow && multiline) {
      setState(prev => moveUp(prev))
      return true
    }

    // Down arrow (multiline only — move to next line, crossing paste boundaries)
    if (key.downArrow && multiline) {
      setState(prev => moveDown(prev))
      return true
    }

    // Enter in multiline mode: insert newline into current text token
    if (key.return && multiline) {
      setState(prev => insertText(prev, "\n"))
      return true
    }

    // Ctrl shortcuts
    if (key.ctrl) {
      switch (input) {
        case "a": // Go to start of line (or start of input in single-line)
          setState(prev => moveHome(prev, multiline))
          return true

        case "e": // Go to end of line (or end of input in single-line)
          setState(prev => moveEnd(prev, multiline))
          return true

        case "d": // Forward-delete: delete char at cursor
          setState(prev => forwardDelete(prev))
          return true

        case "u": // Clear from start of line to cursor
          setState(prev => clearToLineStart(prev, multiline))
          return true

        case "k": // Clear from cursor to end of line
          setState(prev => clearToLineEnd(prev, multiline))
          return true

        case "w": // Delete word before cursor (or preceding paste token)
          setState(prev => deleteWordBack(prev))
          return true

        default:
          return false
      }
    }

    // Regular character input (not ctrl, not meta)
    if (input && !key.meta) {
      // Normalize line endings
      let sanitized = input
      if (sanitized.length > 1) {
        sanitized = sanitized.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
      }
      if (!sanitized) return true

      // Detect multi-line paste: multi-char input containing newlines.
      const isPasteChunk = multiline && sanitized.length > 1 && sanitized.includes("\n")

      if (isPasteChunk) {
        setState(prev => insertPaste(prev, sanitized, true))
      } else {
        setState(prev => insertText(prev, sanitized))
      }
      return true
    }

    return false
  }, [multiline])

  // ── Derive rendering values from token state ──────────────────────
  const { tokens, cursorTokenIndex, cursorCharOffset } = state
  const value = tokensToValue(tokens)
  const cursor = flatCursorPos(state)
  const beforeCursor = value.slice(0, cursor)
  const afterCursor = value.slice(cursor)
  const { lines, cursorLine, cursorCol } = getCursorInfo({ value, cursor })

  // Token-relative cursor info (for rendering per-token)
  const cursorTokenContent = tokens[cursorTokenIndex]?.content || ""
  const tokenInfo = getCursorInfo({ value: cursorTokenContent, cursor: cursorCharOffset })

  // Backward compatibility
  const pasteTokens = tokens.filter(t => t.type === "paste")

  return {
    value,
    cursor,
    handleInput,
    beforeCursor,
    afterCursor,
    lines,
    cursorLine,
    cursorCol,
    tokens,
    cursorTokenIndex,
    cursorCharOffset,
    tokenCursorLine: tokenInfo.cursorLine,
    tokenCursorCol: tokenInfo.cursorCol,
    pastedMultiline: pasteTokens.length > 0,
    pastedContent: pasteTokens.map(t => t.content).join("\n"),
  }
}

// ── Token helpers ───────────────────────────────────────────────────

/** Reconstruct flat string from tokens */
function tokensToValue(tokens: Token[]): string {
  return tokens.map(t => t.content).join("\n")
}

/** Compute absolute cursor position in the flat string */
function flatCursorPos(state: TokenState): number {
  let pos = 0
  for (let i = 0; i < state.cursorTokenIndex; i++) {
    pos += state.tokens[i].content.length
  }
  return pos + state.cursorCharOffset
}

/** Return new tokens array with one token's content replaced */
function replaceTokenContent(tokens: Token[], idx: number, newContent: string): Token[] {
  const result = [...tokens]
  result[idx] = { ...tokens[idx], content: newContent }
  return result
}

/**
 * Normalize token array: merge adjacent text tokens and drop empty non-cursor
 * text tokens that accumulate after consecutive paste operations.
 * Preserves the cursor's text-token invariant.
 */
function normalizeTokens(state: TokenState): TokenState {
  const { tokens, cursorTokenIndex: ci, cursorCharOffset: co } = state
  if (tokens.length <= 1) return state

  const result: Token[] = []
  let newCi = ci
  let newCo = co

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]

    // Try to merge adjacent text tokens
    if (
      tok.type === "text" &&
      result.length > 0 &&
      result[result.length - 1].type === "text"
    ) {
      const prevIdx = result.length - 1
      const prevLen = result[prevIdx].content.length
      result[prevIdx] = { type: "text", content: result[prevIdx].content + tok.content }

      // Adjust cursor if it was on the merged-away token
      if (i === ci) {
        newCi = prevIdx
        newCo = prevLen + co
      } else if (i < ci) {
        // Token removed before cursor → shift cursor index
        newCi--
      }
      continue
    }

    // Drop empty text tokens that aren't the cursor's token
    if (tok.type === "text" && tok.content === "" && i !== ci) {
      if (i < ci) newCi--
      continue
    }

    result.push(tok)
  }

  // Safety: ensure tokens array is never empty
  if (result.length === 0) {
    result.push({ type: "text", content: "" })
    newCi = 0
    newCo = 0
  }

  // Safety: clamp cursor to valid range
  if (newCi < 0) newCi = 0
  if (newCi >= result.length) newCi = result.length - 1
  // If cursor somehow landed on a paste token, move to the next text token
  if (result[newCi].type === "paste") {
    if (newCi + 1 < result.length && result[newCi + 1].type === "text") {
      newCi = newCi + 1
      newCo = 0
    } else if (newCi > 0 && result[newCi - 1].type === "text") {
      newCi = newCi - 1
      newCo = result[newCi].content.length
    }
  }

  return { tokens: result, cursorTokenIndex: newCi, cursorCharOffset: newCo }
}

/**
 * Delete the paste token at `pasteIdx` and merge its adjacent text tokens.
 * Returns new state with cursor adjusted to the correct position in the merged token.
 */
function deletePasteAndMerge(state: TokenState, pasteIdx: number): TokenState {
  const { tokens, cursorTokenIndex: ti, cursorCharOffset: co } = state
  const textBefore = tokens[pasteIdx - 1] // must be text (invariant)
  const textAfter = tokens[pasteIdx + 1]  // must be text (invariant)

  const mergedContent = textBefore.content + textAfter.content
  const newTokens = [
    ...tokens.slice(0, pasteIdx - 1),
    { type: "text" as const, content: mergedContent },
    ...tokens.slice(pasteIdx + 2),
  ]

  // Adjust cursor index: removed 3 tokens at pasteIdx-1, inserted 1 → net -2
  let newTi: number
  let newCo: number

  if (ti === pasteIdx + 1) {
    // Cursor was in text-after-paste → now in merged token
    newTi = pasteIdx - 1
    newCo = textBefore.content.length + co
  } else if (ti === pasteIdx - 1) {
    // Cursor was in text-before-paste → stays in merged token
    newTi = pasteIdx - 1
    newCo = co
  } else if (ti > pasteIdx + 1) {
    // Cursor was in a later token → shift index
    newTi = ti - 2
    newCo = co
  } else {
    // Cursor was in an earlier token → no change
    newTi = ti
    newCo = co
  }

  return { tokens: newTokens, cursorTokenIndex: newTi, cursorCharOffset: newCo }
}

// ── Movement operations (pure functions on TokenState) ──────────────

function moveLeft(state: TokenState, byWord: boolean): TokenState {
  const { tokens, cursorTokenIndex: ti, cursorCharOffset: co } = state
  const token = tokens[ti]

  if (byWord) {
    const newOffset = findPrevWordBoundary(token.content, co)
    if (newOffset < co) {
      return { ...state, cursorCharOffset: newOffset }
    }
    // At start of text token — skip paste to previous text token
    if (ti >= 2 && tokens[ti - 1].type === "paste") {
      const prevToken = tokens[ti - 2]
      return {
        ...state,
        cursorTokenIndex: ti - 2,
        cursorCharOffset: findPrevWordBoundary(prevToken.content, prevToken.content.length),
      }
    }
    return state
  }

  if (co > 0) {
    return { ...state, cursorCharOffset: co - 1 }
  }

  // At start of text token — skip paste to previous text token's end
  if (ti >= 2 && tokens[ti - 1].type === "paste") {
    return {
      ...state,
      cursorTokenIndex: ti - 2,
      cursorCharOffset: tokens[ti - 2].content.length,
    }
  }

  return state
}

function moveRight(state: TokenState, byWord: boolean): TokenState {
  const { tokens, cursorTokenIndex: ti, cursorCharOffset: co } = state
  const token = tokens[ti]

  if (byWord) {
    const newOffset = findNextWordBoundary(token.content, co)
    if (newOffset > co) {
      return { ...state, cursorCharOffset: newOffset }
    }
    // At end of text token — skip paste to next text token
    if (ti + 2 <= tokens.length - 1 && tokens[ti + 1]?.type === "paste") {
      const nextToken = tokens[ti + 2]
      return {
        ...state,
        cursorTokenIndex: ti + 2,
        cursorCharOffset: findNextWordBoundary(nextToken.content, 0),
      }
    }
    return state
  }

  if (co < token.content.length) {
    return { ...state, cursorCharOffset: co + 1 }
  }

  // At end of text token — skip paste to next text token's start
  if (ti + 2 <= tokens.length - 1 && tokens[ti + 1]?.type === "paste") {
    return {
      ...state,
      cursorTokenIndex: ti + 2,
      cursorCharOffset: 0,
    }
  }

  return state
}

function moveHome(state: TokenState, multiline: boolean): TokenState {
  if (!multiline) {
    return { ...state, cursorTokenIndex: 0, cursorCharOffset: 0 }
  }
  const token = state.tokens[state.cursorTokenIndex]
  const info = getCursorInfo({ value: token.content, cursor: state.cursorCharOffset })
  const lineStart = getAbsolutePosition(info.lines, info.cursorLine, 0)
  return { ...state, cursorCharOffset: lineStart }
}

function moveEnd(state: TokenState, multiline: boolean): TokenState {
  if (!multiline) {
    const lastIdx = state.tokens.length - 1
    return {
      ...state,
      cursorTokenIndex: lastIdx,
      cursorCharOffset: state.tokens[lastIdx].content.length,
    }
  }
  const token = state.tokens[state.cursorTokenIndex]
  const info = getCursorInfo({ value: token.content, cursor: state.cursorCharOffset })
  const lineEnd = getAbsolutePosition(
    info.lines,
    info.cursorLine,
    info.lines[info.cursorLine].length,
  )
  return { ...state, cursorCharOffset: lineEnd }
}

function moveUp(state: TokenState): TokenState {
  const { tokens, cursorTokenIndex: ti, cursorCharOffset: co } = state
  const token = tokens[ti]
  const info = getCursorInfo({ value: token.content, cursor: co })

  if (info.cursorLine > 0) {
    // Move to previous line within same text token
    const targetLine = info.cursorLine - 1
    const targetCol = Math.min(info.cursorCol, info.lines[targetLine].length)
    return {
      ...state,
      cursorCharOffset: getAbsolutePosition(info.lines, targetLine, targetCol),
    }
  }

  // At first line of text token — try previous text token (skip paste)
  if (ti >= 2 && tokens[ti - 1].type === "paste") {
    const prevToken = tokens[ti - 2]
    const prevInfo = getCursorInfo({ value: prevToken.content, cursor: prevToken.content.length })
    const lastLine = prevInfo.lines.length - 1
    const targetCol = Math.min(info.cursorCol, prevInfo.lines[lastLine].length)
    return {
      ...state,
      cursorTokenIndex: ti - 2,
      cursorCharOffset: getAbsolutePosition(prevInfo.lines, lastLine, targetCol),
    }
  }

  return state
}

function moveDown(state: TokenState): TokenState {
  const { tokens, cursorTokenIndex: ti, cursorCharOffset: co } = state
  const token = tokens[ti]
  const info = getCursorInfo({ value: token.content, cursor: co })

  if (info.cursorLine < info.lines.length - 1) {
    // Move to next line within same text token
    const targetLine = info.cursorLine + 1
    const targetCol = Math.min(info.cursorCol, info.lines[targetLine].length)
    return {
      ...state,
      cursorCharOffset: getAbsolutePosition(info.lines, targetLine, targetCol),
    }
  }

  // At last line of text token — try next text token (skip paste)
  if (ti + 2 <= tokens.length - 1 && tokens[ti + 1]?.type === "paste") {
    const nextToken = tokens[ti + 2]
    const nextInfo = getCursorInfo({ value: nextToken.content, cursor: 0 })
    const targetCol = Math.min(info.cursorCol, nextInfo.lines[0].length)
    return {
      ...state,
      cursorTokenIndex: ti + 2,
      cursorCharOffset: getAbsolutePosition(nextInfo.lines, 0, targetCol),
    }
  }

  return state
}

// ── Editing operations (pure functions on TokenState) ───────────────

/** Backward-delete: remove char before cursor, or delete entire preceding paste token */
function backwardDelete(state: TokenState): TokenState {
  const { tokens, cursorTokenIndex: ti, cursorCharOffset: co } = state

  if (co > 0) {
    // Normal backspace within text token
    const token = tokens[ti]
    const newContent = token.content.slice(0, co - 1) + token.content.slice(co)
    return {
      tokens: replaceTokenContent(tokens, ti, newContent),
      cursorTokenIndex: ti,
      cursorCharOffset: co - 1,
    }
  }

  // At start of text token — delete preceding paste token atomically
  if (ti >= 2 && tokens[ti - 1].type === "paste") {
    return deletePasteAndMerge(state, ti - 1)
  }

  return state
}

/** Forward-delete: remove char at cursor, or delete entire following paste token */
function forwardDelete(state: TokenState): TokenState {
  const { tokens, cursorTokenIndex: ti, cursorCharOffset: co } = state
  const token = tokens[ti]

  if (co < token.content.length) {
    // Normal forward-delete within text token
    const newContent = token.content.slice(0, co) + token.content.slice(co + 1)
    return {
      tokens: replaceTokenContent(tokens, ti, newContent),
      cursorTokenIndex: ti,
      cursorCharOffset: co,
    }
  }

  // At end of text token — delete following paste token atomically
  if (ti + 1 < tokens.length && tokens[ti + 1].type === "paste") {
    return deletePasteAndMerge(state, ti + 1)
  }

  return state
}

/** Clear from start of current line to cursor (within text token) */
function clearToLineStart(state: TokenState, multiline: boolean): TokenState {
  const { tokens, cursorTokenIndex: ti, cursorCharOffset: co } = state
  const token = tokens[ti]

  if (!multiline) {
    // Single-line: clear everything before cursor
    const newContent = token.content.slice(co)
    return {
      tokens: replaceTokenContent(tokens, ti, newContent),
      cursorTokenIndex: ti,
      cursorCharOffset: 0,
    }
  }

  const info = getCursorInfo({ value: token.content, cursor: co })
  const lineStart = getAbsolutePosition(info.lines, info.cursorLine, 0)
  const newContent = token.content.slice(0, lineStart) + token.content.slice(co)
  return {
    tokens: replaceTokenContent(tokens, ti, newContent),
    cursorTokenIndex: ti,
    cursorCharOffset: lineStart,
  }
}

/** Clear from cursor to end of current line (within text token) */
function clearToLineEnd(state: TokenState, multiline: boolean): TokenState {
  const { tokens, cursorTokenIndex: ti, cursorCharOffset: co } = state
  const token = tokens[ti]

  if (!multiline) {
    // Single-line: clear everything after cursor
    const newContent = token.content.slice(0, co)
    return {
      tokens: replaceTokenContent(tokens, ti, newContent),
      cursorTokenIndex: ti,
      cursorCharOffset: co,
    }
  }

  const info = getCursorInfo({ value: token.content, cursor: co })
  const lineEnd = getAbsolutePosition(
    info.lines,
    info.cursorLine,
    info.lines[info.cursorLine].length,
  )
  const newContent = token.content.slice(0, co) + token.content.slice(lineEnd)
  return {
    tokens: replaceTokenContent(tokens, ti, newContent),
    cursorTokenIndex: ti,
    cursorCharOffset: co,
  }
}

/** Delete word before cursor; at token start, delete preceding paste token */
function deleteWordBack(state: TokenState): TokenState {
  const { tokens, cursorTokenIndex: ti, cursorCharOffset: co } = state
  const token = tokens[ti]

  const newOffset = findPrevWordBoundary(token.content, co)
  if (newOffset < co) {
    const newContent = token.content.slice(0, newOffset) + token.content.slice(co)
    return {
      tokens: replaceTokenContent(tokens, ti, newContent),
      cursorTokenIndex: ti,
      cursorCharOffset: newOffset,
    }
  }

  // At start of text token — delete preceding paste token
  if (ti >= 2 && tokens[ti - 1].type === "paste") {
    return deletePasteAndMerge(state, ti - 1)
  }

  return state
}

/** Insert plain text at the cursor position in the current text token */
function insertText(state: TokenState, text: string): TokenState {
  const { tokens, cursorTokenIndex: ti, cursorCharOffset: co } = state
  const token = tokens[ti]
  const newContent = token.content.slice(0, co) + text + token.content.slice(co)
  return {
    tokens: replaceTokenContent(tokens, ti, newContent),
    cursorTokenIndex: ti,
    cursorCharOffset: co + text.length,
  }
}

/**
 * Insert a paste token at the cursor position.
 *
 * Splits the current text token around the cursor and inserts a new paste
 * token with the content that arrived:
 * [text(preservedBefore), paste(fullContent), text(after)].
 *
 * When `absorbCurrentLine` is true (non-bracketed paste fallback), any text
 * on the current line before the cursor is absorbed into the paste content.
 * This captures the first line of a paste that arrived as a separate input
 * chunk (without a newline) before the chunk that triggered paste detection.
 *
 * When false (bracketed paste — the common case), the text before the cursor
 * is user-typed content and is preserved as-is in the preceding text token.
 */
function insertPaste(state: TokenState, content: string, absorbCurrentLine = false): TokenState {
  const { tokens, cursorTokenIndex: ti, cursorCharOffset: co } = state
  const token = tokens[ti]

  const before = token.content.slice(0, co)
  const after = token.content.slice(co)

  let preservedBefore: string
  let fullPasteContent: string

  if (absorbCurrentLine && before.length > 0) {
    // Absorb text on the current line (after the last newline) before the
    // cursor into the paste content — this is the first line of a paste that
    // leaked as regular text because it arrived without a newline.
    const lastNl = before.lastIndexOf("\n")
    preservedBefore = lastNl >= 0 ? before.slice(0, lastNl + 1) : ""
    const absorbed = lastNl >= 0 ? before.slice(lastNl + 1) : before
    fullPasteContent = absorbed + content
  } else {
    preservedBefore = before
    fullPasteContent = content
  }

  const newTokens = [
    ...tokens.slice(0, ti),
    { type: "text" as const, content: preservedBefore },
    { type: "paste" as const, content: fullPasteContent },
    { type: "text" as const, content: after },
    ...tokens.slice(ti + 1),
  ]

  return normalizeTokens({
    tokens: newTokens,
    cursorTokenIndex: ti + 2, // text token after the paste
    cursorCharOffset: 0,
  })
}

// ── General helpers ─────────────────────────────────────────────────

/** Compute cursor line and column from value + cursor position */
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
