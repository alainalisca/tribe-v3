import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        // YOUR ACTUAL BRAND COLORS from guidelines
        'tribe-green': '#C0E863',
        'tribe-dark': '#272D34',
        'tribe-gray-80': '#52575D',
        'tribe-gray-60': '#B1B3B6',
        'tribe-gray-40': '#F2F2F2',
        'tribe-red': '#E33629',
      },
    },
  },
  plugins: [],
};

export default config;
