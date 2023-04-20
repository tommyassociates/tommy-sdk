const fs = require('fs')
const yaml = require('js-yaml')
const path = require('path')
const url = require('url')
const { globSync } = require('glob')

// const archiver = require('archiver')
// const request = require('request')
// const url = require('url')
// const addonBuilder = require('./addon-builder')

const port = 8080
const publicDir = 'addons'
const privateDir = '../tommy-sdk-private/addons'

function resolvePath() {
  let args = Array.prototype.slice.call(arguments)
  // args = [__dirname, '..'].concat(args)
  args = [process.cwd()].concat(args)
  return path.join.apply(path.join, args)
}

function archivePath(pkg, environment, version) {
  return resolvePath('archives', `${pkg}-${environment}-${version}.zip`)
}

let config
function getConfig() {
  if (config)
    return config

  try {
    config = JSON.parse(fs.readFileSync(resolvePath('config.json')), 'utf8')
    return config
  } catch (e) {
    throw new Error('Cannot load config.json: ' + e)
  }
}

let configCn
function getCnConfig() {
  if (config)
    return config
  try {
    configCn = JSON.parse(fs.readFileSync(resolvePath('config-cn.json')), 'utf8')
    return configCn
  } catch (e) {}
}

function getSdkVariables() {
  return {
    SDK_URL: JSON.stringify(getSdkUrl()),
    SDK_CONFIG: JSON.stringify(getConfig()),
    SDK_LOCAL_ADDONS: JSON.stringify(readLocalAddons()),
    API_KEY: JSON.stringify(getConfig().apiKey),
    API_URL: JSON.stringify(getConfig().apiEndpoint),
    API_ENDPOINT: JSON.stringify(getConfig().apiEndpoint + '/v1/'),
    SANDBOX_URL: JSON.stringify(getConfig().apiSandboxEndpoint),
    SANDBOX_ENDPOINT: JSON.stringify(getConfig().apiSandboxEndpoint + '/v1/')
  }
}

function getSdkUrl() {
  return `http://localhost:${port}`
  // return `http://localhost:${app.get('port')}`
}

function isPrivateAddon(pkg) {
  return fs.existsSync(resolvePath(privateDir, pkg))
}

function getLocalAddonFilePath(pkg, environment, version, file) {
  if (isPrivateAddon(pkg)) {
    return resolvePath(privateDir, pkg, environment, file) //, version
  } else {
    return resolvePath(publicDir, pkg, environment, file) //, version
  }
}

function readLocalAddon(pkg, environment, version) {
  const path = getLocalAddonFilePath(pkg, environment, version, 'manifest.yml')
  return readLocalAddonFromManifestPath(path)
}

function readLocalAddonFromManifestPath(path) {
  const addon = yaml.load(fs.readFileSync(path, 'utf8'))
  return initAddon(addon)
}

function initAddon(addon) {
  const base = `/addons/${addon.package}/${addon.environment || 'production'}/${addon.version}/files/`
  addon.url = url.resolve(getSdkUrl(), base)
  addon.icon_url = url.resolve(addon.url, 'icon.png') // path + '/icon.png'
  addon.file_base_url = url.resolve(getSdkUrl(), base)
  addon.dir_prefix = isPrivateAddon(addon.package) ? privateDir : publicDir
  addon.local = true

  if (addon.assets) {
    addon.assets.forEach((asset) => {
      asset.url = url.resolve(addon.url, asset.file)
    })
  }

  if (addon.views) {
    const views = []
    Object.keys(addon.views).forEach((id) => {
      const view = addon.views[id]
      view.id = id
      if (view.url) view.url = url.resolve(addon.url, view.file)
      view.local = true
      if (view.assets) {
        for (let x = 0; x < view.assets.length; x += 1) {
          const asset = view.assets[x]
          asset.url = url.resolve(addon.url, asset.file)
        }
      }
      views.push(view)
    })

    // convert views to an array
    addon.views = views
  }

  return addon
}

function readLocalAddons() {
  const addons = []
  const paths = globSync([
    resolvePath(privateDir) + '/**/manifest.yml',
    resolvePath(publicDir) + '/**/manifest.yml',
  ])

  paths.forEach((path) => addons.push(readLocalAddonFromManifestPath(path)))
  return addons
}


module.exports = {
  port,
  resolvePath,
  archivePath,
  getConfig,
  getCnConfig,
  getSdkVariables,
  getSdkUrl,
  // readLocalAddonVersions,
  getLocalAddonFilePath,
  readLocalAddon,
  readLocalAddons
  // createAddon,
  // createAddonArchive
}
