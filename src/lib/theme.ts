// ── Solarized Color Palette ─────────────────────────────────────────
// https://ethanschoonover.com/solarized/
//
// The UI targets dark mode (base03 background) with Solarized accents.
// A light mode variant is defined but not yet wired up.

export const solarized = {
  // Base tones (dark bg → light fg)
  base03:  "#002b36", // darkest background
  base02:  "#073642", // dark background highlights
  base01:  "#586e75", // optional emphasized content (comments)
  base00:  "#657b83", // light mode body text
  base0:   "#839496", // dark mode body text
  base1:   "#93a1a1", // optional emphasized content
  base2:   "#eee8d5", // light background highlights
  base3:   "#fdf6e3", // lightest background

  // Accent colors
  yellow:  "#b58900",
  orange:  "#cb4b16",
  red:     "#dc322f",
  magenta: "#d33682",
  violet:  "#6c71c4",
  blue:    "#268bd2",
  cyan:    "#2aa198",
  green:   "#859900",
} as const

// ── Dark Mode Theme (default) ───────────────────────────────────────

export const theme = {
  // Priority colors
  priority: {
    critical: solarized.red,
    high: solarized.yellow,
    normal: solarized.base0,
    low: solarized.base01,
  },

  // Status colors (column headers, status labels)
  status: {
    backlog: solarized.base01,
    todo: solarized.blue,
    in_progress: solarized.yellow,
    in_review: solarized.violet,
    done: solarized.green,
    cancelled: solarized.red,
  },

  // Lane background colors — uniform Solarized base03 for all lanes.
  // Lane differentiation comes exclusively from title/header accent colors.
  statusBg: {
    backlog:     solarized.base03,
    todo:        solarized.base03,
    in_progress: solarized.base03,
    in_review:   solarized.base03,
    done:        solarized.base03,
    cancelled:   solarized.base03,
  } as Record<string, string>,

  // Text color for content rendered on colored lane backgrounds
  laneText: {
    primary: solarized.base1,          // high-contrast body text
    secondary: solarized.base0,        // secondary info
    muted: solarized.base01,           // dimmed / de-emphasized
  },

  // Task type colors
  taskType: {
    feature: solarized.green,
    bug: solarized.red,
    analysis: solarized.cyan,
  },

  // UI element colors
  ui: {
    selected: "inverse",               // Ink's inverse style
    ready: solarized.green,
    blocked: solarized.red,
    header: "bold",
    muted: solarized.base01,
    // Panel/overlay backgrounds
    panelBg: solarized.base03,
    panelBgCyan: solarized.base02,     // info panels (detail, help, filters)
    panelBgRed: "#1a0f0f",            // destructive action panels
    panelBgYellow: "#1a1500",          // warning panels
    headerBg: solarized.base03,
    scrollbar: {
      track: solarized.base01,
      thumb: solarized.base1,
      thumbActive: solarized.cyan,
    },
    // Accent colors for specific UI elements
    accent: solarized.cyan,            // focused fields, active sections
    accentWarm: solarized.yellow,      // section headings in help
    success: solarized.green,          // toast confirmations
    danger: solarized.red,             // errors, blocked state
    warning: solarized.yellow,         // archive/remove overlays
    info: solarized.blue,              // info badges
  },
}

// ── Light Mode Theme (for future use) ───────────────────────────────

export const themeLight = {
  priority: {
    critical: solarized.red,
    high: solarized.yellow,
    normal: solarized.base00,
    low: solarized.base1,
  },
  status: {
    backlog: solarized.base1,
    todo: solarized.blue,
    in_progress: solarized.yellow,
    in_review: solarized.violet,
    done: solarized.green,
    cancelled: solarized.red,
  },
  statusBg: {
    backlog:     solarized.base3,
    todo:        solarized.base3,
    in_progress: solarized.base3,
    in_review:   solarized.base3,
    done:        solarized.base3,
    cancelled:   solarized.base3,
  } as Record<string, string>,
  laneText: {
    primary: solarized.base00,
    secondary: solarized.base01,
    muted: solarized.base1,
  },
}

// ── Helpers ─────────────────────────────────────────────────────────

export function getPriorityColor(priority: string): string {
  return theme.priority[priority as keyof typeof theme.priority] || solarized.base0
}

export function getStatusColor(status: string): string {
  return theme.status[status as keyof typeof theme.status] || solarized.base0
}

export function getTaskTypeColor(type: string): string {
  return theme.taskType[type as keyof typeof theme.taskType] || solarized.base01
}

export function getStatusBgColor(status: string): string {
  return theme.statusBg[status] || theme.ui.panelBg
}
