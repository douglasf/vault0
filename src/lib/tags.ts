/**
 * Shared tags normalization helpers.
 * Used by both CLI and TUI to ensure consistent parsing/formatting semantics.
 */

/**
 * Parse a comma-separated tags string into a normalized, deduplicated array.
 * Trims whitespace, removes empty entries, and preserves first-seen ordering.
 *
 * @param input - Raw comma-separated tags string
 */
export function parseTags(input: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of input.split(",")) {
    const tag = raw.trim()
    if (tag && !seen.has(tag)) {
      seen.add(tag)
      result.push(tag)
    }
  }
  return result
}

/**
 * Format a tags array back to a comma-separated display string.
 *
 * @param tags - Array of tag strings
 */
export function formatTags(tags: string[]): string {
  return tags.join(", ")
}
