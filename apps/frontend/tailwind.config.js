/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1c5d99",
          foreground: "#ffffff",
        },
      },
    },
  },
  plugins: [],
};
