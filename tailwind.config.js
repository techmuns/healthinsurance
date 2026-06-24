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
        royal: '#315AA9',
        muted: {
          blue: '#3D5F9F',
        },
        soft: {
          blue: '#EEF4FF',
          border: '#E1E6EF',
        },
        ice: '#F4F7FC',
        ivory: '#F6F4EF',
        // Layered surface system (avoid pure white everywhere)
        surface: {
          DEFAULT: '#FCFCFB',
          tint: '#F6F9FD',
          band: '#F8F9FB',
        },
        card: '#FFFFFF',
        ink: {
          primary: '#26303F',
          secondary: '#6B7280',
        },
        signal: {
          positive: '#2F855A',
          warning: '#B7791F',
          negative: '#B94A48',
        },
        // Selective accent pops (institutional, signal-led)
        teal: { DEFAULT: '#168E8E', soft: '#E1F2F1' },
        emerald: { DEFAULT: '#2F855A', soft: '#E6F1EB' },
        gold: { DEFAULT: '#B7791F', soft: '#FBF3E2' },
        coral: { DEFAULT: '#C75D54', soft: '#F8ECEC' },
        lavender: { DEFAULT: '#6E7BD6', soft: '#ECEEFB' },
        // Muted champagne gold — premium editorial accent + nav rail tint
        champagne: { DEFAULT: '#B68B3A', deep: '#9C7430', soft: '#F4ECDB' },
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
        // Editorial serif — Cormorant Garamond — for the Insights tab's written
        // narrative only (advisor read, headlines, theses, takeaways). Charts,
        // tables, numbers and UI labels stay on the sans/display stacks above.
        editorial: [
          '"Cormorant Garamond"',
          'Georgia',
          'ui-serif',
          'serif',
        ],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(23, 43, 77, 0.05), 0 10px 24px rgba(23, 43, 77, 0.08)',
        card: '0 1px 3px rgba(23, 43, 77, 0.05), 0 16px 38px rgba(23, 43, 77, 0.10)',
        lift: '0 18px 46px rgba(23, 43, 77, 0.14)',
        bar: '0 3px 20px rgba(23, 43, 77, 0.07)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'drawer-in': {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        // Opacity-only crossfade for in-place content swaps (e.g. the adaptive
        // header frequency slot) — no translate, so the layout never shifts.
        'fade-soft': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        // Soft page-change entrance: a gentle fade + small upward translate so
        // swapping tabs/sections feels like a calm state change, never a hard
        // cut or a jump. Tuned to the premium easing (220–280ms band).
        'page-enter': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'drawer-in': 'drawer-in 0.28s ease-out both',
        'page-enter': 'page-enter 0.26s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-soft': 'fade-soft 0.24s ease-out both',
      },
      // Shared premium motion tokens — one calm easing + a 160/240/320ms scale,
      // used for opacity / transform / colour / shadow transitions across the
      // tabs, toggles, pills and cards so motion reads consistently.
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        fast: '160ms',
        normal: '240ms',
        slow: '320ms',
      },
    },
  },
  plugins: [],
}
