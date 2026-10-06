/**
 * levelMeta.js
 * Single source of truth for alert-level colours, labels, and icons.
 * Used by React pages — the backend (smtp-notifier, ans-notifier) has its own copy.
 *
 * Status palette from the validated dataviz palette (palette.md):
 *   good     #0ca30c  / warning #fab219 / critical #d03b3b
 * These map to INFO / WARNING / ALERT respectively.
 */

export const LEVEL_META = {
  INFO: {
    label: 'OK',
    emoji: '✅',
    // Tailwind classes
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-800 dark:text-green-300',
    dot: 'bg-green-500',
    badgeBg: 'bg-green-100 dark:bg-green-900/40',
    badgeText: 'text-green-700 dark:text-green-300',
    // hex (for recharts / inline styles)
    hex: '#0ca30c',
    barBg: '#dcfce7',
  },
  WARNING: {
    label: 'Warning',
    emoji: '⚠️',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    border: 'border-yellow-200 dark:border-yellow-800',
    text: 'text-yellow-800 dark:text-yellow-300',
    dot: 'bg-yellow-500',
    badgeBg: 'bg-yellow-100 dark:bg-yellow-900/40',
    badgeText: 'text-yellow-700 dark:text-yellow-300',
    hex: '#fab219',
    barBg: '#fef9c3',
  },
  ALERT: {
    label: 'Alert',
    emoji: '🚨',
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-800 dark:text-red-300',
    dot: 'bg-red-500',
    badgeBg: 'bg-red-100 dark:bg-red-900/40',
    badgeText: 'text-red-700 dark:text-red-300',
    hex: '#d03b3b',
    barBg: '#fee2e2',
  },
}

/** Return the meta for a level string, defaulting to INFO for unknowns. */
export function getLevelMeta(level) {
  return LEVEL_META[level?.toUpperCase()] || LEVEL_META.INFO
}

/** Derive alert level from a usage percentage and two threshold values. */
export function deriveLevelFromPct(pct, warningPct = 70, alertPct = 90) {
  if (pct >= alertPct) return 'ALERT'
  if (pct >= warningPct) return 'WARNING'
  return 'INFO'
}
