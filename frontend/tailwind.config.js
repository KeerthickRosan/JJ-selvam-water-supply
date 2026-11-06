/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef7ff', 100: '#d9edff', 200: '#bce0ff', 300: '#8ecdff', 400: '#59b0ff', 500: '#338dfc', 600: '#1d6ef1', 700: '#1558de', 800: '#1847b4', 900: '#0b3a78', 950: '#0b2550' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
};
