const fs = require('fs')
const junk = require('junk')
const yaml = require('js-yaml')
const path = require('path')
const url = require('url')
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

function archivePath(pkg, version) {
  return resolvePath('archives', `${pkg}-${version}.zip`)
}

function getFilteredFiles(dir, pkg) {
  let files = fs.readdirSync(dir, pkg)
  files = files.filter(junk.not)
  return files;
}

let config;
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

let configCn;
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
//
//
// function createAddon(action, pkg, version, archivePath, callback) {
//   const urls = [];
//   if (getConfig() && getConfig().apiEndpoint) {
//     urls.push(`${getConfig().apiEndpoint}/v1/addons/${action}?api_key=${getConfig().apiKey}`)
//   }
//   if (getCnConfig() && getCnConfig().apiEndpoint) {
//     urls.push(`${getCnConfig().apiEndpoint}/v1/addons/${action}?api_key=${getCnConfig().apiKey}`)
//   }
//
//   const promises = []
//   promises.push(addonBuilder(pkg, version))
//   promises.push(...urls.map(url => new Promise((resolve, reject) => {
//     console.log('uploading to ', url)
//     request.post({
//       url,
//       formData: {
//         package: pkg,
//         version,
//         archive: fs.createReadStream(archivePath),
//       },
//     }, (err, httpResponse, body) => {
//       if (!err && httpResponse.statusCode === 201) {
//         console.log('uploaded to ', url)
//         resolve(JSON.parse(body))
//       } else {
//         console.log('error uploading to ', url)
//         let errMessage;
//         try {
//           errMessage = JSON.parse(body)
//         } catch (e) {}
//         reject(errMessage || err)
//       }
//     })
//   })))
//
//   Promise.all(promises)
//     .then((jsons) => {
//       callback(null, jsons)
//     })
//     .catch((errs) => {
//       callback('Upload failed', errs)
//     })
// }

function getSdkUrl() {
  return `http://localhost:${port}`;
  // return `http://localhost:${app.get('port')}`;
}

function readLocalAddonVersions() {
  const addons = {};

  // Add public packages
  const packages = getFilteredFiles(resolvePath(publicDir))
  for (let i = 0; i < packages.length; i += 1) {
    addons[packages[i]] = getFilteredFiles(resolvePath(publicDir, packages[i]))
  }

  // Add private packages
  const privPackages = getFilteredFiles(resolvePath(privateDir))
  for (let i = 0; i < privPackages.length; i += 1) {
    addons[privPackages[i]] = getFilteredFiles(resolvePath(privateDir, privPackages[i]))
  }

  // throw privPackages
  return addons;
}

function isPrivateAddon(pkg) {
  return fs.existsSync(resolvePath(privateDir, pkg))
}

function getLocalAddonFilePath(pkg, version, file) {
  if (isPrivateAddon(pkg)) {
    return resolvePath(privateDir, pkg, version, file)
  } else {
    return resolvePath(publicDir, pkg, version, file)
  }
}

function readLocalAddon(pkg, version) {
  const addon = yaml.safeLoad(fs.readFileSync(getLocalAddonFilePath(pkg, version, 'manifest.yml'), 'utf8'))
  const base = `/addons/${addon.package}/versions/${addon.version}/files/`;
  addon.url = url.resolve(getSdkUrl(), base)
  addon.icon_url = url.resolve(addon.url, 'icon.png') // path + '/icon.png'
  addon.file_base_url = url.resolve(getSdkUrl(), base)
  addon.dir_prefix = isPrivateAddon(pkg) ? privateDir : publicDir;
  addon.local = true;

  if (addon.assets) {
    addon.assets.forEach((asset) => {
      asset.url = url.resolve(addon.url, asset.file)
    })
  }

  if (addon.views) {
    const views = [];
    Object.keys(addon.views).forEach((id) => {
      const view = addon.views[id];
      view.id = id;
      if (view.url) view.url = url.resolve(addon.url, view.file)
      view.local = true;
      if (view.assets) {
        for (let x = 0; x < view.assets.length; x += 1) {
          const asset = view.assets[x];
          asset.url = url.resolve(addon.url, asset.file)
        }
      }
      views.push(view)
    })

    // convert views to an array
    addon.views = views;
  }
  return addon;
}

function readLocalAddons() {
  const addons = [];
  const data = readLocalAddonVersions()
  Object.keys(data).forEach((pkg) => {
    const versions = data[pkg];
    for (let i = 0; i < versions.length; i += 1) {
      const manifest = readLocalAddon(pkg, versions[i])
      // console.log(manifest)
      addons.push(manifest)
    }
  })
  return addons;
}


module.exports = {
  port,
  resolvePath,
  archivePath,
  getConfig,
  getCnConfig,
  getSdkVariables,
  getSdkUrl,
  readLocalAddonVersions,
  getLocalAddonFilePath,
  readLocalAddon,
  readLocalAddons
  // createAddon,
  // createAddonArchive
}
