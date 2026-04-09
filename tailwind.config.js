/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#faf7f2',
        cream: '#f0ebe0',
        warm: '#e8e0d0',
        ink: '#0f0e0c',
        gold: { DEFAULT: '#b8962e', light: '#d4b458', pale: '#faf4e2' },
        teal: { DEFAULT: '#1e4a52', light: '#2d6b78', pale: '#e8f2f4' },
        rust: { DEFAULT: '#b04030', pale: '#faeeeb' },
        sage: { DEFAULT: '#3d5c3a', pale: '#edf3ec' },
        muted: '#6b6456',
        border: '#ddd5c4',
      },
      fontFamily: {
        serif: ['Georgia', 'serif'],
        mono: ['"Courier New"', 'monospace'],
      },
    },
  },
  plugins: [],
};
