import type { Config } from 'tailwindcss';
import { COLORS } from './src/theme/tokens';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nativewindPreset = require('nativewind/preset');

export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [nativewindPreset],
  theme: {
    extend: {
      colors: COLORS,
      // Global typography bump: the default scale read small on-device, so the
      // whole app (auth → chat) scales up here in one place. [size, lineHeight].
      fontSize: {
        xs: ['13px', { lineHeight: '18px' }],
        sm: ['15px', { lineHeight: '21px' }],
        base: ['17px', { lineHeight: '24px' }],
        lg: ['20px', { lineHeight: '28px' }],
        xl: ['24px', { lineHeight: '30px' }],
        '2xl': ['28px', { lineHeight: '34px' }],
        '3xl': ['34px', { lineHeight: '40px' }],
      },
    },
  },
  plugins: [],
} satisfies Config;
