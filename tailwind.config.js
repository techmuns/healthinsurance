/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#243F78',
          primary: '#27457E',
          deep: '#172B4D',
        },
        muted: {
          blue: '#3D5F9F',
        },
        soft: {
          blue: '#EAF1FF',
          border: '#E5E8EF',
        },
        ice: '#F4F7FC',
        ivory: '#FAF8F3',
        card: '#FFFFFF',
        ink: {
          primary: '#1F2937',
          secondary: '#6B7280',
        },
        signal: {
          positive: '#2F855A',
          warning: '#B7791F',
          negative: '#B94A48',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: [
          'Fraunces',
          'Georgia',
          'ui-serif',
          'serif',
        ],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(23, 43, 77, 0.04), 0 4px 16px rgba(23, 43, 77, 0.05)',
        card: '0 1px 3px rgba(23, 43, 77, 0.05), 0 8px 24px rgba(23, 43, 77, 0.06)',
        lift: '0 8px 28px rgba(23, 43, 77, 0.12)',
        bar: '0 2px 14px rgba(23, 43, 77, 0.07)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'drawer-in': {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'drawer-in': 'drawer-in 0.28s ease-out both',
      },
    },
  },
  plugins: [],
}
