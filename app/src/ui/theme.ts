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
