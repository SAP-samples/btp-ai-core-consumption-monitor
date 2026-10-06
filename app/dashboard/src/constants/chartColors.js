/**
 * chartColors.js
 * Validated categorical palette for Recharts, from the dataviz skill palette.md.
 * Adjacent-pair tested in both light and dark modes (OKLab ΔE ≥ 8).
 *
 * CU-type slots (4 series — stacked bar):
 *   Inference   → slot 1  blue
 *   Grounding   → slot 3  aqua
 *   GenAI Token → slot 7  violet
 *   Data Indexed→ slot 2  orange
 */

export const CU_TYPE_COLORS = {
  light: {
    inference:    '#2a78d6',  // slot 1  blue
    grounding:    '#1baf7a',  // slot 3  aqua
    genaiToken:   '#4a3aa7',  // slot 7  violet
    dataIndexed:  '#eb6834',  // slot 2  orange
  },
  dark: {
    inference:    '#3987e5',
    grounding:    '#199e70',
    genaiToken:   '#9085e9',
    dataIndexed:  '#d95926',
  }
}

/** Top-models bar chart: single-hue sequential (blue, light→dark). */
export const SEQUENTIAL_BLUE = ['#cde2fb', '#86b6ef', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']

/** Chart chrome */
export const CHART_CHROME = {
  light: {
    gridline: '#e1e0d9',
    axis: '#c3c2b7',
    muted: '#898781',
    surface: '#fcfcfb',
  },
  dark: {
    gridline: '#2c2c2a',
    axis: '#383835',
    muted: '#898781',
    surface: '#1a1a19',
  }
}

/** Ordered array for stacked CU-type charts. */
export const CU_TYPE_SERIES = [
  { key: 'inferenceCu',   label: 'Inference',    lightHex: '#2a78d6', darkHex: '#3987e5' },
  { key: 'groundingCu',   label: 'Grounding',    lightHex: '#1baf7a', darkHex: '#199e70' },
  { key: 'genaiTokenCu',  label: 'GenAI Token',  lightHex: '#4a3aa7', darkHex: '#9085e9' },
  { key: 'dataIndexedCu', label: 'Data Indexed', lightHex: '#eb6834', darkHex: '#d95926' },
]
