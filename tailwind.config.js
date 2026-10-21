/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#effaf7', 100: '#d6f3ec', 200: '#aee6d9', 300: '#7ad2c1', 400: '#47b8a6',
          500: '#259b8b', 600: '#1a7c70', 700: '#18635b', 800: '#174f49', 900: '#16423e',
        },
        ink: { DEFAULT: '#14201f', soft: '#4a5a58', faint: '#7b8886' },
        paper: { DEFAULT: '#f7f8f7', card: '#ffffff', line: '#e4e8e6' },
      },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
};
