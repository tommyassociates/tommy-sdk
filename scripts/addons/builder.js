const path = require('path')
const webpack = require('webpack')
const helpers = require('../helpers')

const { VueLoaderPlugin } = require('vue-loader')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const TerserPlugin = require('terser-webpack-plugin')

function resolvePath(dir) {
  return path.join(__dirname, '..', '..', dir)
}

function resolveAddonPath(baseDir, ...dir) {
  return path.join(baseDir, ...dir)
}

function createConfig(pkg, version, localAddonFilePath) {
  return {
    mode: process.env.NODE_ENV,
    devtool: false,
    optimization: {
      minimize: process.env.NODE_ENV === 'production',
      minimizer: process.env.NODE_ENV === 'production' ? [
        new TerserPlugin({
          extractComments: false
        }),
      ] : []
    },
    entry: {
      addon: resolveAddonPath(localAddonFilePath, `addons/${pkg}/${version}/src/addon.js`),
    },
    output: {
      filename: '[name].js',
      path: resolveAddonPath(localAddonFilePath, `addons/${pkg}/${version}/build`),
      libraryTarget: 'var',
      library: 'addon'
    },
    resolve: {
      extensions: ['.js', '.vue', '.json'],
      alias: {
        '@': resolveAddonPath(localAddonFilePath, `addons/${pkg}/${version}/src`),
      },
      modules: [
        resolvePath('node_modules')
      ]
    },
    externals: {
      // vuex: 'externalLibs.vuex'
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          use: 'babel-loader'
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
          ]
        },
        {
          test: /\.(png|jpe?g|gif|svg|eot|ttf|woff|woff2)$/i,
          type: 'asset/resource'
        }
      ]
    },
    plugins: [
      new webpack.DefinePlugin(helpers.getSdkVariables()),
      new VueLoaderPlugin(),
      new MiniCssExtractPlugin({
        filename: '[name].css',
      }),
      new CleanWebpackPlugin({
        cleanOnceBeforeBuildPatterns: [resolveAddonPath(localAddonFilePath, `addons/${pkg}/${version}/build/*.*`)],
        dangerouslyAllowCleanPatternsOutsideProject: true,
        dry: false // should be ok
      })
    ]
  }
}

module.exports = function(pkg, version) {
  const localAddonFilePath = helpers.getLocalAddonFilePath('', '', '..') // ex. tommy-sdk-private

  return new Promise((resolve, reject) => {
    console.error('addon building', pkg, version, 'in', process.env.NODE_ENV)
    const config = createConfig(pkg, version, localAddonFilePath)
    const compiler = webpack(config)
    compiler.run((err, stats) => {
      if (err) {
        console.error('addon compile failed', pkg, version)
        console.error(err.stack || err)
        if (err.details) {
          console.error(err.details)
        }
        reject(err)
        return;
      }

      const info = stats.toJson()
      if (stats.hasErrors()) {
        console.error('addon compile error:', info.errors)
        reject(info.errors)
        return;
      }

      if (stats.hasWarnings()) {
        console.warn('addon compile warning:', info.warnings.map(x => x.message))
      }

      console.log('addon compiled', pkg, version)
      resolve(stats)
    })
  })
}