/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sap: {
          blue: '#0057d2',
          dark: '#223548',
          gray: '#354a5f',
          light: '#f4f6f9',
          border: '#d5dadd',
          green: '#28a745',
          orange: '#e9730c',
          red: '#bb0000',
        }
      }
    },
  },
  plugins: [],
}