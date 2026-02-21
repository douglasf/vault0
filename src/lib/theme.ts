export const theme = {
  // Priority colors
  priority: {
    critical: "red",
    high: "yellow",
    normal: "white",
    low: "gray",
  },

  // Status colors (column headers)
  status: {
    backlog: "gray",
    todo: "blue",
    in_progress: "yellow",
    in_review: "magenta",
    done: "green",
    cancelled: "red",
  },

  // UI element colors
  ui: {
    border: "gray",
    borderActive: "cyan",
    selected: "inverse", // Ink's inverse style
    ready: "green",
    blocked: "red",
    header: "bold",
    muted: "gray",
    scrollbar: {
      track: "gray",
      thumb: "white",
      thumbActive: "cyan",
    },
  },
}

// Export helper: get priority bullet color
export function getPriorityColor(priority: string): string {
  return theme.priority[priority as keyof typeof theme.priority] || "white"
}

// Export helper: get status color
export function getStatusColor(status: string): string {
  return theme.status[status as keyof typeof theme.status] || "white"
}
