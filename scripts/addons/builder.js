const webpack = require('webpack');
const VueLoaderPlugin = require('vue-loader/lib/plugin');
const OptimizeCSSPlugin = require('optimize-css-assets-webpack-plugin')
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
// const CopyWebpackPlugin = require('copy-webpack-plugin');
// const HtmlWebpackPlugin = require('html-webpack-plugin');
// const MiniCssExtractPlugin = require('mini-css-extract-plugin')
// const entryPlus = require('webpack-entry-plus');

const glob = require('glob');
const path = require('path');
const helpers = require('../helpers');

function resolvePath(dir) {
  return path.join(__dirname, '..', '..', dir);
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
  // console.log('HELPPPPPPPPPPPPPPPPPPPPP', helpers)
  // console.log('HELPPPPPPPPPPPPPPPPPPPPP', helpers.getSdkVariables)
  // console.log('HELPPPPPPPPPPPPPPPPPPPPP', helpers.getSdkVariables())
  const jsEntry = `addons/${pkg}/${version}/build/addon`
  const cssEntry = `addons/${pkg}/${version}/build/addon.css`

  return {
    // mode: 'development',
    mode: 'production',
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
          // use: {
          //   loader: 'babel-loader',
          //   options: {
          //     presets: [
          //       ['es2015', {
          //           'useBuiltIns': true,
          //           'modules': "commonjs",
          //       }],
          //       'stage-1',
          //       'react'
          //       // [
          //       //   '@babel/preset-env',
          //       //   {
          //       //     useBuiltIns: false,
          //       //     loose: true,
          //       //     modules: 'commonjs'
          //       //   }
          //       // ]
          //     ]
          //     // presets: ['@babel/preset-env'],
          //     // plugins: ['@babel/plugin-transform-runtime']
          //   }
          // },
          include: [
            resolvePath('addons'),
            resolvePath('node_modules/framework7'),
            resolvePath('node_modules/framework7-vue'),
            resolvePath('node_modules/template7'),
            resolvePath('node_modules/dom7'),
            resolvePath('node_modules/ssr-window'),
          ],
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
      new UglifyJsPlugin({
        uglifyOptions: {
          compress: {
            // warnings: false
          }
        },
        sourceMap: true,
        parallel: true
      }),
      // new OptimizeCSSPlugin({
      //   cssProcessorOptions: {
      //     safe: true,
      //     map: { inline: false }
      //   }
      // }),
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
    const config = createConfig(pkg, version);
    const compiler = webpack(config);
    compiler.run((err, stats) => {
      if (err) {
        console.error('addon compile failed', pkg, version);
        console.error(err.stack || err);
        if (err.details) {
          console.error(err.details);
        }
        reject(err)
        return;
      }

      const info = stats.toJson();

      if (stats.hasErrors()) {
        console.error(info.errors);
      }

      if (stats.hasWarnings()) {
        console.warn(info.warnings);
      }

      console.log('addon compiled', pkg, version);
      resolve(stats)
    });
  });
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
//     configs.push(createConfig(pkg, versions[i]));
//   }
// });
//
// const compiler = webpack(configs);
// const watching = compiler.watch({
//   aggregateTimeout: 300,
//   poll: undefined
// }, (err, stats) => {})
