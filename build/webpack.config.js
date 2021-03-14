const webpack = require('webpack');
const path = require('path');
const helpers = require('../scripts/helpers');

const CopyWebpackPlugin = require('copy-webpack-plugin');
const { VueLoaderPlugin } = require('vue-loader')
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

function resolvePath(dir) {
  return path.join(__dirname, '..', dir);
}

module.exports = {
  mode: process.env.NODE_ENV,
  devtool: process.env.NODE_ENV !== 'production' ? 'eval-cheap-source-map' : false,
  optimization: {
    minimize: process.env.NODE_ENV === 'production',
    minimizer: process.env.NODE_ENV === 'production' ? [
      new TerserPlugin({
        extractComments: false
      }),
    ] : []
  },
  entry: {
    sdk: [
      './src/sdk.js',
      'webpack-hot-middleware/client?reload=true&timeout=1000'
    ]
  },
  output: {
    path: resolvePath('www'),
    filename: '[name].bundle.js',
    publicPath: '/'
  },
  resolve: {
    extensions: ['.js', '.vue', '.json'],
    alias: {
      '@': resolvePath('src'),
      '@addon': resolvePath('../tommy-sdk-private/addons'),
    },
    modules: [
      resolvePath('src'),
      resolvePath('node_modules'),
      resolvePath('node_modules/tommy-core/node_modules')
      // TODO: investigate how this performs when using a npm published tommy-core
    ],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: 'babel-loader',
      },
      {
        test: /\.vue$/,
        use: 'vue-loader',
      },
      {
        test: /\.(sa|sc|c)ss$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          'sass-loader'
        ],
      },
      {
        test: /\.(png|jpe?g|gif|svg|eot|ttf|woff|woff2)$/i,
        type: 'asset/resource',
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin(helpers.getSdkVariables()),
    new webpack.HotModuleReplacementPlugin(),
    // new webpack.NamedModulesPlugin(),
    new VueLoaderPlugin(),
    new HtmlWebpackPlugin({
      filename: './index.html',
      template: './src/index.html',
      inject: true
    }),
    new MiniCssExtractPlugin({
      filename: 'css/sdk.css'
    }),
    new CopyWebpackPlugin({
      patterns: [{
        from: resolvePath('static'),
        to: resolvePath('www/static'),
      }]
    }),
    new CleanWebpackPlugin({
      // dry: true,
      cleanOnceBeforeBuildPatterns: [resolvePath('*.hot-update.*')],
      // cleanAfterEveryBuildPatterns: [resolvePath(`addons/${pkg}/${version}/build/addon.css.js`)]
    })
  ]
}
