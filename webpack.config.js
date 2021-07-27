const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: "development",
  entry: "./dist/box-and-pointer.js",
  plugins: [
    new CopyWebpackPlugin({
        patterns: [
            { from: "static", to: "../release" }
        ]
    })
  ],
  output: {
    filename: "../release/box-and-pointer.min.js",
  }
}