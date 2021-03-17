const path = require('path')

const { merge } = require('webpack-merge')
const common = require('./webpack.common.js')

const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const TerserPlugin = require('terser-webpack-plugin')
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin')

function resolvePath(dir) {
  return path.join(__dirname, '..', dir)
}

// NOTE: might be unneeded
// const pathsToCleanWeb = [
//   resolvePath(`${outPath}/js/*.js`),
//   resolvePath(`${outPath}/css/*.css`),
//   resolvePath('*.hot-update.*')
// ]
// const pathsToCleanCordova = [
//   resolvePath(`${outPath}/*.*`)
// ]

module.exports = merge(common, {
  mode: 'production',
  devtool: 'source-map',
  optimization: {
    splitChunks: {
      cacheGroups: {
        styles: {
          name: 'styles',
          type: 'css/mini-extract',
          chunks: 'all',
          enforce: true
        },
      },
    },
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false
      }),
      new CssMinimizerPlugin()
    ]
  },
  entry: {
    'js/sdk.min': [
      './src/sdk.js'
    ]
  },
  output: {
    path: resolvePath('www'), // for prod?
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: 'css/sdk.min.css'
    })
  ]
})