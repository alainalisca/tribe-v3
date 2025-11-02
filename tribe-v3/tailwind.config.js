/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'tribe-green': '#84cc16',
        'tribe-dark': '#334155',
        'tribe-darker': '#1e293b',
      },
    },
  },
  plugins: [],
}
