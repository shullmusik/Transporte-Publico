/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semáforo de estado: alto contraste para uso bajo luz solar
        ok: { DEFAULT: '#16a34a', dark: '#14532d', light: '#bbf7d0' },
        warn: { DEFAULT: '#f59e0b', dark: '#78350f', light: '#fde68a' },
        danger: { DEFAULT: '#dc2626', dark: '#7f1d1d', light: '#fecaca' },
      },
      minHeight: { touch: '48px' },
      fontSize: { huge: ['3.5rem', { lineHeight: '1', fontWeight: '800' }] },
    },
  },
  plugins: [],
}
