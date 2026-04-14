/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Brand primary (new site-wide tokens from Stitch) ─────────────
        primary: '#e8c357',
        'primary-container': '#b8962e',
        'on-primary': '#3d2f00',
        'on-primary-container': '#3f3000',
        'primary-fixed': '#ffe08d',
        'primary-fixed-dim': '#e8c357',
        'on-primary-fixed': '#241a00',
        'on-primary-fixed-variant': '#584400',
        'inverse-primary': '#745b00',

        // ── Secondary / tertiary (Stitch Material palette) ──────────────
        secondary: '#e4c366',
        'secondary-container': '#745b00',
        'on-secondary': '#3d2f00',
        'on-secondary-container': '#f8d575',
        'secondary-fixed': '#ffe08b',
        'secondary-fixed-dim': '#e4c366',
        'on-secondary-fixed': '#241a00',
        'on-secondary-fixed-variant': '#584400',
        tertiary: '#b7c4ff',
        'tertiary-container': '#8496e1',
        'on-tertiary': '#152a6f',
        'on-tertiary-container': '#172c71',
        'tertiary-fixed': '#dde1ff',
        'tertiary-fixed-dim': '#b7c4ff',
        'on-tertiary-fixed': '#001552',
        'on-tertiary-fixed-variant': '#2f4287',

        // ── Dark surfaces (public pages + authenticated header) ─────────
        background: '#141311',
        'on-background': '#e6e2de',
        surface: '#141311',
        'on-surface': '#e6e2de',
        'surface-dim': '#141311',
        'surface-bright': '#3b3936',
        'surface-container-lowest': '#0f0e0c',
        'surface-container-low': '#1d1b19',
        'surface-container': '#211f1d',
        'surface-container-high': '#2b2a27',
        'surface-container-highest': '#363432',
        'surface-variant': '#363432',
        'on-surface-variant': '#d0c5b0',
        'surface-tint': '#e8c357',
        'inverse-surface': '#e6e2de',
        'inverse-on-surface': '#32302e',
        outline: '#99907d',
        'outline-variant': '#4d4636',
        error: '#ffb4ab',
        'error-container': '#93000a',
        'on-error': '#690005',
        'on-error-container': '#ffdad6',

        // ── Workspace tokens (authenticated pages, bright surface) ──────
        paper: '#faf7f2',
        cream: '#f0ebe0',
        warm: '#e8e0d0',
        ink: '#0f0e0c',

        // ── Legacy brand tokens (updated to new palette) ────────────────
        gold: { DEFAULT: '#e8c357', light: '#d4b458', pale: '#faf4e2' },
        teal: { DEFAULT: '#1e4a52', light: '#2d6b78', pale: '#e8f2f4' },
        rust: { DEFAULT: '#b04030', pale: '#faeeeb' },
        sage: { DEFAULT: '#3d5c3a', pale: '#edf3ec' },
        muted: '#6b6456',
        border: '#ddd5c4',
      },
      fontFamily: {
        // Site-wide fonts from Stitch design
        headline: ['Newsreader', 'serif'],
        body: ['Manrope', 'sans-serif'],
        label: ['"Space Grotesk"', 'monospace'],
        // Legacy aliases — updated to new stack
        serif: ['Newsreader', 'Georgia', 'serif'],
        mono: ['"Space Grotesk"', '"Courier New"', 'monospace'],
        sans: ['Manrope', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
        full: '0.75rem',
      },
    },
  },
  plugins: [],
};
