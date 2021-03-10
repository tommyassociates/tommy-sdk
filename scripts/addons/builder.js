const webpack = require('webpack')
const { VueLoaderPlugin } = require('vue-loader')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
// const CopyWebpackPlugin = require('copy-webpack-plugin')
// const HtmlWebpackPlugin = require('html-webpack-plugin')
// const MiniCssExtractPlugin = require('mini-css-extract-plugin')
// const entryPlus = require('webpack-entry-plus')

var fs = require('fs')
const glob = require('glob')
const path = require('path')
const helpers = require('../helpers')

function resolvePath(dir) {
  return path.join(__dirname, '..', '..', dir)
}

function jsOutputPath(file) {
  return file
          .replace(resolvePath('./'), '')
          .replace('src/addon.js', 'build/addon')
}

function cssOutputPath(file) {
  return file
          .replace(resolvePath('./'), '')
          .replace('src/addon.scss', 'build/addon.css')
}

function createConfig(pkg, version) {
  const jsEntry = `addons/${pkg}/${version}/build/addon`
  const cssEntry = `addons/${pkg}/${version}/build/addon.css`

  return {
    mode: 'production', // 'development'
    devtool: false,
    entry: {
      [jsEntry]: resolvePath(`addons/${pkg}/${version}/src/addon.js`),
      [cssEntry]: resolvePath(`addons/${pkg}/${version}/src/addon.scss`),
    },
    output: {
      filename: '[name].js',
      path: resolvePath(''),
      libraryTarget: 'var',
      library: 'addon',
      // iife: true,
      // module: false,
      // libraryTarget: 'commonjs',
      // libraryExport: 'addon'
      // publicPath: '/'
    },
    resolve: {
      extensions: ['.js', '.vue', '.json'],
      alias: {
        'vue$': 'vue/dist/vue.esm.js',
        '@': resolvePath('src'),
      }
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          use: 'babel-loader',
          // include: [
          //   resolvePath('addons'),
          //   resolvePath('node_modules/tommy-core'),
          //   resolvePath('node_modules/framework7'),
          //   resolvePath('node_modules/framework7-vue'),
          //   resolvePath('node_modules/template7'),
          //   resolvePath('node_modules/dom7'),
          //   resolvePath('node_modules/ssr-window'),
          // ],
        },
        {
          test: /\.vue$/,
          use: 'vue-loader',
        },
        {
          test: /\.scss$/,
          use: [
            {
              loader: 'file-loader',
              options: {
                name: cssOutputPath
                // name: '[path][name].css',
              }
            },
            // {
            //     loader: 'postcss-loader'
            // },
            'sass-loader'
          ]
        },
        // {
        //   test: /\.scss$/,
        //   use: [
        //     {
        //       loader: 'file-loader',
        //       options: {
        //         // name: 'dist/css/[name].css',
        //         // name: '[path][name].css',
        //         // name: '[name].css',
        //         name: 'addons/availability/1.0.0/build/addon.css',
        //       }
        //     },
        //     {
        //         loader: 'extract-loader'
        //     },
        //     {
        //         loader: 'css-loader?-url'
        //         // loader: 'css-loader'
        //     },
        //     // {
        //     //     loader: 'postcss-loader'
        //     // },
        //     {
        //       loader: 'sass-loader'
        //     }
        //   ]
        // }
      ]
    },
    plugins: [
      new webpack.DefinePlugin(helpers.getSdkVariables()),
      // new webpack.HotModuleReplacementPlugin(),
      // new webpack.NamedModulesPlugin(),
      new VueLoaderPlugin(),
      // new webpack.HashedModuleIdsPlugin(),
      // new webpack.optimize.ModuleConcatenationPlugin(),
      new CleanWebpackPlugin({
        // dry: true,
        cleanOnceBeforeBuildPatterns: [resolvePath(`addons/${pkg}/${version}/build/addon.*`)],
        cleanAfterEveryBuildPatterns: [resolvePath(`addons/${pkg}/${version}/build/addon.css.js`)]
      })
    ]
  }
}

module.exports = function(pkg, version) {
  return new Promise((resolve, reject) => {
    console.error('addon building', pkg, version)
    const config = createConfig(pkg, version)
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
        console.warn('addon compile warning:', info.warnings)
      }

      console.log('addon compiled', pkg, version)

      // FIX: Addons need to be exported as a global variable to support old
      // builds, so we need to ensure the default module is exposed directly.
      const outputFile = resolvePath(`addons/${pkg}/${version}/build/addon.js`)
      fs.readFile(outputFile, 'utf8', function (err, data) {
        if (err) {
          return console.log(err)
        }

        const result = data.slice(0, -1) + '.default;'
        fs.writeFile(outputFile, result, 'utf8', function (err) {
           if (err) return console.log(err)
           resolve(stats) // success
        })
      })

      // resolve(stats)
    })
  })
}



// module.exports = {
//   buildAddon
// }

// const addonVersions = helpers.readLocalAddonVersions()
// const configs = []
//
// Object.keys(addonVersions).forEach((pkg) => {
//   const versions = addonVersions[pkg];
//   for (let i = 0; i < versions.length; i += 1) {
//     configs.push(createConfig(pkg, versions[i]))
//   }
// })
//
// const compiler = webpack(configs)
// const watching = compiler.watch({
//   aggregateTimeout: 300,
//   poll: undefined
// }, (err, stats) => {})
