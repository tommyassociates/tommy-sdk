/* eslint no-console: off */
/* eslint no-shadow: off */
/* eslint no-empty: off */
/* eslint no-param-reassign: off */

const express = require('express')
const webpack = require('webpack')
const webpackDevMiddleware = require('webpack-dev-middleware')
const webpackHotMiddleware = require('webpack-hot-middleware')
const addonBuilder = require('./scripts/addons/builder')
const addonArchiver = require('./scripts/addons/archiver')
const addonUploader = require('./scripts/addons/uploader')
const helpers = require('./scripts/helpers')

const env = process.env.NODE_ENV || 'development'
const webpackConfigFilename = env === 'development' ? 'dev' : 'prod'
const webpackConfig = require(`./build/webpack.${webpackConfigFilename}.js`)

const app = express()
const compiler = webpack(webpackConfig)
const fs = require('fs')

// Middleware
// --------------------------

app.use(webpackDevMiddleware(compiler, {
  // noInfo: true,
  publicPath: webpackConfig.output.publicPath,
  headers: { "Access-Control-Allow-Origin": "*" },
  stats: 'errors-warnings'
  // stats: { colors: true } // 'errors-only'
}))

if (env === 'development') app.use(webpackHotMiddleware(compiler))


// Routes
// --------------------------

app.get('/addons', (req, res) => {
  res.send(helpers.readLocalAddons())
})

app.get('/addons/:package/:version', (req, res) => {
  res.send(helpers.readLocalAddon(req.params.package, req.params.version))
})

app.get('/addons/:package/versions/:version/files/*', (req, res) => {
  res.sendFile(helpers.getLocalAddonFilePath(req.params.package, req.params.version, req.params['0']))
})

app.post('/addon/build/:package/:version', async (req, res) => {
  const pkg = req.params.package
  const version = req.params.version
  await addonBuilder(pkg, version)
  await addonArchiver(pkg, version)
  res.sendStatus(200)
})

app.post('/addon/buildAll', async (req, res) => {
  const addons = helpers.readLocalAddons()
  for (let x in addons) {
    const pkg = addons[x].package
    const version = addons[x].version
    const srcpath = helpers.getLocalAddonFilePath(pkg, version, 'src/addon.js')
    if (fs.existsSync(srcpath)) {
      await addonBuilder(pkg, version)
      await addonArchiver(pkg, version)
    }
  }

  // .forEach(async (addon) => {
  //   const pkg = addon.package
  //   const version = addon.version
  //   await addonBuilder(pkg, version)
  //   await addonArchiver(pkg, version)
  // }
  res.sendStatus(200)
})

app.post('/addon/sandbox/upload/:package/:version', (req, res) => {
  const pkg = req.params.package;
  const version = req.params.version;
  addonUploader('upload', pkg, version, (errs, jsons) => {
    if (errs) {
      res.status(500).send(errs[0] || errs[1])
    } else {
      res.send(jsons[0] || jsons[1])
    }
  })
})

app.post('/addon/sandbox/update/:package/:version', (req, res) => {
  const pkg = req.params.package;
  const version = req.params.version;
  addonUploader('update', pkg, version, (err, json) => {
    if (err) {
      res.status(500).send(err)
    } else {
      res.send(json)
    }
  })
})

app.post('/addon/store/submit/:package/:version', (req, res) => {
  const pkg = req.params.package;
  const version = req.params.version;
  addonUploader('submit', pkg, version, (err, json) => {
    if (err) {
      res.status(500).send(err)
    } else {
      res.send(json)
    }
  })
})

app.listen(helpers.port, () => console.log(`SDK emulator listening on port ${helpers.getSdkUrl()}`))
