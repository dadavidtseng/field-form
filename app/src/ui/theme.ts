// High-contrast field theme (DESIGN.md §4.4): near-black on white, yellow only for active state.
export const color = {
  ink: '#111111',
  paper: '#FFFFFF',
  muted: '#4A4A4A',
  line: '#D0D0D0',
  active: '#FFC400',
  ok: '#1B7F3B',
  warn: '#B26A00',
  bad: '#B3261E',
} as const;

/** Minimum touch target for gloved hands. */
export const TOUCH = 64;
