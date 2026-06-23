import type { Config } from 'tailwindcss';
import { COLORS } from './src/theme/tokens';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nativewindPreset = require('nativewind/preset');

export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [nativewindPreset],
  theme: { extend: { colors: COLORS } },
  plugins: [],
} satisfies Config;
