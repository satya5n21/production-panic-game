/** @type {import('tailwindcss').Config} */
export default {
  // Scan every TS/TSX module so utilities used in child components are generated.
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
