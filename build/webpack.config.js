const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { VueLoaderPlugin } = require('vue-loader')
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
// const sdkServer = require('../sdk-server');
const helpers = require('../scripts/helpers');

const path = require('path');

function resolvePath(dir) {
  return path.join(__dirname, '..', dir);
}


module.exports = {
  mode: 'development',
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
      'vue': '@vue/runtime-dom',
      '@': resolvePath('src'),
      '@addon': resolvePath('../tommy-sdk-private/addons'),
    },
    modules: [
      // resolvePath('node_modules/tommy_core/src'),
      // resolvePath('node_modules/tommy_core/src/scss'),
      resolvePath('src'),
      resolvePath('node_modules'),
      // 'node_modules'
    ]
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: 'babel-loader',
        include: [
          resolvePath('src'),
          resolvePath('node_modules'),
          // resolvePath('node_modules/framework7'),
          // resolvePath('node_modules/framework7-vue'),
          // resolvePath('node_modules/template7'),
          // resolvePath('node_modules/dom7'),
          // resolvePath('node_modules/ssr-window'),
          // resolvePath('node_modules/vuex'),
        ],
      },
      {
        test: /\.vue$/,
        use: 'vue-loader',
      },
      {
        test: /\.css$/,
        use: [
          // MiniCssExtractPlugin.loader,
          'style-loader',
          'css-loader',
        ],
      },
      {
        test: /\.(scss|sass)/,
        use: [
          // MiniCssExtractPlugin.loader,
          'style-loader',
          'css-loader',
          'sass-loader'
          // {
          //   loader: 'resolve-url-loader'
          // },
          // {
          //   loader: 'sass-loader',
          //   // options: {
          //   //   sassOptions: {
          //   //     includePaths: [
          //   //       resolvePath('node_modules/tommy_core/src/scss')
          //   //     ]
          //   //   }
          //   // }
          // }
          // 'css-loader',
          // 'less-loader',
          // {
          //   loader: MiniCssExtractPlugin.loader,
          //   options: { publicPath: '/' }
          // },
          // { loader: 'css-loader' },
          // { loader: 'sass-loader' }
        ]
      },
      // {
      //   test: /\.css$/,
      //   use: [
      //     MiniCssExtractPlugin.loader,
      //     'css-loader',
      //   ],
      // },
      // {
      //   test: /\.styl(us)?$/,
      //   use: [
      //     MiniCssExtractPlugin.loader,
      //     'css-loader',
      //     'stylus-loader',
      //   ],
      // },
      {
        test: /\.(png|jpe?g|gif|svg)(\?.*)?$/,
        loader: 'url-loader',
        options: {
          limit: 10000,
          name: 'images/[name].[hash:7].[ext]'
        }
      },
      // {
      //   test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/,
      //   loader: 'url-loader',
      //   options: {
      //     limit: 10000,
      //     name: 'media/[name].[hash:7].[ext]'
      //   }
      // },
      {
        test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/,
        loader: 'url-loader',
        options: {
          limit: 10000,
          name: 'fonts/[name].[hash:7].[ext]'
        }
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
      inject: true,
    }),
    // new MiniCssExtractPlugin({
    //   publicPath: '/',
    //   filename: '[name].css?[hash]'
    // }),
    // new MiniCssExtractPlugin({
    //   filename: 'app.css'
    // }),
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
