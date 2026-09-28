const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const { EsbuildPlugin } = require("esbuild-loader");

module.exports = (env, argv) => {
  const isProd = argv.mode === "production";

  return {
    entry: "./src/index.jsx",
    output: {
      path: path.resolve(__dirname, "assets"),
      filename: "react-bundle.js",
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          loader: "esbuild-loader",
          options: {
            loader: "jsx",
            target: "es2020",
          },
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, "css-loader", "postcss-loader"],
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: "tailwind-compiled.css",
      }),
    ],
    resolve: {
      extensions: [".js", ".jsx"],
    },
    optimization: {
      minimize: isProd,
      minimizer: isProd
        ? [
            new EsbuildPlugin({
              target: "es2020",
              css: true,
              minify: true,
              legalComments: "none", // 🔥 Removes license and other comments
            }),
          ]
        : [],
    },
    mode: isProd ? "production" : "development",
    watch: !isProd,
  };
};