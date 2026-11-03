import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#FFD43B',
        'brand-soft': '#FFF6CC',
        ink: '#202124',
        paper: '#F5F5F2',
        line: '#E4E4DF',
        muted: '#5F6368',
        ok: '#22A06B',
        'ok-text': '#1A7F55',
        'ok-soft': '#E3F4EC',
        warn: '#F59E0B',
        'warn-text': '#92400E',
        'warn-soft': '#FEF3C7',
        bad: '#E5484D',
        'bad-text': '#A3262B',
        'bad-soft': '#FDE8E8'
      },
      fontFamily: {
        sans: ['Manrope', 'Inter', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        card: '22px'
      }
    }
  },
  plugins: []
};

export default config;
