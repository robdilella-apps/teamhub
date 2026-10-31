/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { brand: 'rgb(var(--brand) / <alpha-value>)' } } },
  plugins: [],
}
