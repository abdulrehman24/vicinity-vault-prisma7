/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        vicinity: {
          peach: "#ebc1b6",
          slate: "#4a5a67",
          "slate-light": "#6b7d8c",
          "peach-dark": "#d4a89d"
        }
      },
      fontFamily: {
        sans: ["\"Century Gothic\"", "CenturyGothic", "AppleGothic", "sans-serif"]
      }
    }
  },
  plugins: []
};
