// High-contrast theme for bright sun: near-black on white, yellow reserved for the active state.
export const color = {
  ink: '#111111',
  paper: '#FFFFFF',
  muted: '#4A4A4A',
  line: '#D0D0D0',
  active: '#FFC400',
  /** Dimension lines showing what to measure: strong blue reads in sun and is distinct from the yellow selection. */
  guide: '#0047CC',
  ok: '#1B7F3B',
  warn: '#B26A00',
  bad: '#B3261E',
} as const;

/** Minimum touch target for gloved hands. */
export const TOUCH = 64;

/** Layout switches, in dp (same physical size on any screen density). */
export const breakpoints = {
  /** Narrower than this (phones in portrait): header shows icons/symbols instead of words. */
  compactBelow: 500,
  /**
   * At least this wide: panels go beside the canvas instead of below it. The office inspector
   * uses it on any wide screen; the field controls also require landscape.
   */
  sideBySideFrom: 700,
  /** Shorter than this (phones in landscape): dense controls so they fit beside the canvas. */
  shortBelow: 500,
} as const;

/** One height for every control in a screen header, so the row lines up. */
export const HEADER_CONTROL = 52;
export const HEADER_RADIUS = 12;
