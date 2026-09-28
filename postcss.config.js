module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
    'postcss-rem-to-pixel': {
      rootValue: 16, // Since your base is 10px
      unitPrecision: 4,
      propList: ['*'],
      replace: true,
      mediaQuery: false,
      minRemValue: 0,
    },
  },
}
