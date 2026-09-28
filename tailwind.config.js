/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./templates/*.liquid",
    "./sections/*.liquid",
    "./layout/*.liquid",
    "./snippets/*.liquid",
  ],
  theme: {
    extend: {
      fontFamily: {
        recoleta: ["Recoleta", "serif"],
        circle: ["CircularStd", "sans-serif"],
      },
      colors: {
        blackPurple: "#2a2447",
        darkPurple: "#6A2786",
        purple: "#9151B7",
        litePurple: "#E8D7EF",
        purpleCream: "#f9f4fb",
        saffron: "#e64a4a",
      },
    },
  },
  plugins: [],
};
