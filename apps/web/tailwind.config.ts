import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#06101f',
        surface: '#0b1626',
        'surface-2': '#11203a',
        line: '#1c2c46',
        accent: {
          DEFAULT: '#1d6ef5',
          hover: '#3b82f6',
          soft: 'rgba(29,110,245,0.14)',
        },
        ink: '#e8eef7',
        muted: '#8da3c0',
        faint: '#5b6f8c',
        success: '#1fae6a',
        warn: '#f5a524',
        danger: '#ef4444',
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        sans: ['var(--font-geist-sans)', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(29,110,245,0.45), 0 10px 36px rgba(29,110,245,0.28)',
        card: '0 1px 0 rgba(255,255,255,0.03) inset, 0 12px 34px rgba(0,0,0,0.45)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        blink: { '0%,100%': { opacity: '0.2' }, '50%': { opacity: '1' } },
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(0.22,1,0.36,1) both',
        blink: 'blink 1.3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
