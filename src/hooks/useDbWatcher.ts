import { useEffect, useRef } from "react"
import { watch, type FSWatcher } from "node:fs"
import { dirname } from "node:path"

/**
 * Watches the SQLite database directory for changes and triggers a callback.
 *
 * Watches the parent directory (`.vault0/`) rather than the single `.db` file
 * because SQLite in WAL mode writes to `vault0.db-wal` first, and changes only
 * reach the main file on checkpoint. Watching the directory catches both.
 *
 * Debounces rapid-fire FS events (common with SQLite writes) into a single
 * callback invocation after the burst settles.
 */
export function useDbWatcher(dbPath: string, onRefresh: () => void): void {
  // Use refs to avoid re-creating the watcher when the callback identity changes
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    const dir = dirname(dbPath)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let watcher: FSWatcher | null = null
    // Suppress events during startup: migrations and seed writes trigger
    // rapid FS events that overlap with the initial React render, creating
    // a burst of synchronous DB queries that can crash Bun's runtime.
    let ready = false
    const startupTimer = setTimeout(() => { ready = true }, 500)

    // Only fire the callback for meaningful database file changes.
    // Exclude -shm (shared memory): SQLite reads can update the SHM index,
    // which would create a watcher → re-render → read → SHM update → watcher
    // feedback loop that hammers the runtime and can trigger Bun segfaults.
    const DB_FILE_PATTERN = /vault0\.db(-wal)?$/

    const handleChange = (_event: string, filename: string | null) => {
      // Filter: only react to DB file mutations, ignore unrelated files
      // (e.g., error.log, .gitignore)
      if (filename && !DB_FILE_PATTERN.test(filename)) {
        return
      }

      // Skip events during startup grace period
      if (!ready) return

      // Debounce: a single CLI operation (e.g., `vault0 task add`) produces
      // multiple rapid FS events (WAL write, index update, possible checkpoint).
      // Wait for the burst to settle before refreshing.
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }

      debounceTimer = setTimeout(() => {
        debounceTimer = null
        onRefreshRef.current()
      }, 150)
    }

    try {
      watcher = watch(dir, { persistent: false }, handleChange)

      // Silence watcher errors (e.g., directory deleted externally) —
      // the TUI can continue running with stale data rather than crashing
      watcher.on("error", () => {
        // Intentionally silent — watcher may fail if dir is removed
      })
    } catch {
      // If watch setup fails entirely (e.g., OS limit), silently degrade —
      // the TUI still works, just without auto-refresh
    }

    return () => {
      clearTimeout(startupTimer)
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      if (watcher) {
        watcher.close()
      }
    }
  }, [dbPath])
}
