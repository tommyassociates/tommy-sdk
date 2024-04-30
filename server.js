const express = require('express')
const ViteExpress = require('vite-express')
// import ViteExpress from "vite-express";

// const webpack = require('webpack')
// const webpackDevMiddleware = require('webpack-dev-middleware')
// const webpackHotMiddleware = require('webpack-hot-middleware')
const addonBuilder = require('./scripts/addons/builder')
const addonArchiver = require('./scripts/addons/archiver')
const addonUploader = require('./scripts/addons/uploader')
const helpers = require('./scripts/helpers')


// console.log(helpers.readLocalAddons())

const env = process.env.NODE_ENV || 'development'
// const webpackConfigFilename = env === 'development' ? 'dev' : 'prod'
// const webpackConfig = require(`./build/webpack.${webpackConfigFilename}.js`)

const app = express()
// const compiler = webpack(webpackConfig)
const fs = require('fs')

// Middleware
// --------------------------

// app.use(webpackDevMiddleware(compiler, {
//   // noInfo: true,
//   publicPath: webpackConfig.output.publicPath,
//   headers: { "Access-Control-Allow-Origin": "*" },
//   stats: 'errors-warnings'
//   // stats: { colors: true } // 'errors-only'
// }))

// if (env === 'development') app.use(webpackHotMiddleware(compiler))


// Routes
// --------------------------

app.get('/addons', (req, res) => {
  res.send(helpers.readLocalAddons())
})

app.get('/addons/:package/:environment/:version', (req, res) => {
  const pkg = req.params.package
  const environment = req.params.environment || 'production'
  const version = req.params.version
  res.send(helpers.readLocalAddon(package, environment, version))
})

app.get('/addons/:package/:environment/:version/files/*', (req, res) => {
  const pkg = req.params.package
  const environment = req.params.environment || 'production'
  const version = req.params.version
  res.sendFile(helpers.getLocalAddonFilePath(pkg, environment, version, req.params['0']))
})

app.post('/addon/build/:package/:environment/:version', async (req, res) => {
  const pkg = req.params.package
  const environment = req.params.environment || 'production'
  const version = req.params.version
  await addonBuilder(pkg, environment, version)
  await addonArchiver(pkg, environment, version)
  res.sendStatus(200)
})

app.post('/addon/buildAll', async (req, res) => {
  const addons = helpers.readLocalAddons()
  for (let x in addons) {
    const pkg = addons[x].package
    const environment = addons[x].environment || 'production'
    const version = addons[x].version
    const srcpath = helpers.getLocalAddonFilePath(pkg, environment, version, 'src/addon.js')
    if (fs.existsSync(srcpath)) {
      await addonBuilder(pkg, environment, version)
      await addonArchiver(pkg, environment, version)
    }
  }

  // .forEach(async (addon) => {
  //   const pkg = addon.package
  //   const version = addon.version
  //   await addonBuilder(pkg, environment, version)
  //   await addonArchiver(pkg, environment, version)
  // }
  res.sendStatus(200)
})

app.post('/addon/sandbox/upload/:package/:environment/:version', (req, res) => {
  const pkg = req.params.package
  const environment = req.params.environment || 'production'
  const version = req.params.version
  addonUploader('upload', pkg, environment, version, (errs, jsons) => {
    if (errs) {
      res.status(500).send(errs[0] || errs[1])
    } else {
      res.send(jsons[0] || jsons[1])
    }
  })
})

app.post('/addon/sandbox/update/:package/:environment/:version', (req, res) => {
  const pkg = req.params.package
  const environment = req.params.environment || 'production'
  const version = req.params.version
  addonUploader('update', pkg, environment, version, (err, json) => {
    if (err) {
      res.status(500).send(err)
    } else {
      res.send(json)
    }
  })
})

app.post('/addon/store/submit/:package/:environment/:version', (req, res) => {
  const pkg = req.params.package
  const environment = req.params.environment || 'production'
  const version = req.params.version
  addonUploader('submit', pkg, environment, version, (err, json) => {
    if (err) {
      res.status(500).send(err)
    } else {
      res.send(json)
    }
  })
})

// app.listen(helpers.port, () => console.log(`SDK emulator listening on port ${helpers.getSdkUrl()}`))
ViteExpress.listen(app, helpers.port, () => console.log(`SDK emulator listening on port ${helpers.getSdkUrl()}`))
