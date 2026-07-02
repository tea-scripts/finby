/** Color palette — mirrors apps/web/tailwind.config.ts so web and mobile share
 *  one visual language. JS source of truth; tailwind.config.js consumes this. */
export const COLORS = {
  canvas: '#06101f',
  surface: '#0b1626',
  'surface-2': '#11203a',
  line: '#1c2c46',
  accent: { DEFAULT: '#1d6ef5', hover: '#3b82f6', soft: 'rgba(29,110,245,0.14)' },
  ink: '#e8eef7',
  muted: '#8da3c0',
  faint: '#5b6f8c',
  success: '#1fae6a',
  warn: '#f5a524',
  danger: '#ef4444',
} as const;

/** Dark-only fill for inert "track"/placeholder surfaces (donut track, skeleton
 *  blocks). Deliberately NOT in COLORS — that palette mirrors web tailwind, and
 *  this is a mobile detail until light-mode theming lands. */
export const TRACK = '#16233a';
