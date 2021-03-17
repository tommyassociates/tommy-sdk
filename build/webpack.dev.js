const path = require('path')

const { merge } = require('webpack-merge')
const common = require('./webpack.common.js')

const { HotModuleReplacementPlugin } = require('webpack')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')

function resolvePath(dir) {
  return path.join(__dirname, '..', dir)
}

module.exports = merge(common, {
  mode: 'development',
  devtool: 'eval-cheap-source-map',
  entry: {
    'js/sdk': [
      './src/sdk.js',
      'webpack-hot-middleware/client?reload=true&timeout=1000'
    ]
  },
  output: {
    path: resolvePath('www'), // for prod?
  },
  plugins: [
    new HotModuleReplacementPlugin(),
    new MiniCssExtractPlugin({
      filename: 'css/sdk.css'
    })
  ]
})