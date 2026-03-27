/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          100: '#1e2130',
          200: '#252836',
          300: '#2e3347',
        },
      },
    },
  },
  plugins: [],
}