const fs = require('fs')
const request = require('request')
const url = require('url')
const helpers = require('../helpers')
const addonBuilder = require('./builder')
const addonArchiver = require('./archiver')


module.exports = async function(action, pkg, version, callback) {
  const urls = [];
  if (helpers.getConfig() && helpers.getConfig().apiEndpoint) {
    urls.push(`${helpers.getConfig().apiEndpoint}/v1/addons/${action}?api_key=${helpers.getConfig().apiKey}`)
  }
  if (helpers.getCnConfig() && helpers.getCnConfig().apiEndpoint) {
    urls.push(`${helpers.getCnConfig().apiEndpoint}/v1/addons/${action}?api_key=${helpers.getCnConfig().apiKey}`)
  }

  await addonBuilder(pkg, version)
  await addonArchiver(pkg, version)

  const archivePath = helpers.archivePath(pkg, version)
  const promises = urls.map(url => new Promise((resolve, reject) => {
    console.log('uploading to ', url, archivePath)
    request.post({
      url,
      formData: {
        package: pkg,
        version,
        archive: fs.createReadStream(archivePath),
      },
    }, (err, httpResponse, body) => {
      if (!err && httpResponse.statusCode === 201) {
        console.log('addon uploaded to ', url)
        resolve(JSON.parse(body))
      } else {
        let errMessage;
        try {
          errMessage = JSON.parse(body)
        } catch (e) {}
        console.error('addon upload error', url, errMessage)
        reject(errMessage || err)
      }
    })
  }))

  Promise.all(promises)
    .then((jsons) => {
      callback(null, jsons)
    })
    .catch((errs) => {
      callback('addon batch upload failed', errs)
    })
}



// const port = 8080;
// let config;
// let configCn;

// function resolvePath() {
//   let args = Array.prototype.slice.call(arguments)
//   args = [__dirname, '..'].concat(args)
//   // console.log('AAAA', args)
//   // return path.join.apply(path.join, args)
//   return path.join.apply(path.join, args)
//   // return path.join(__dirname, '..', dir)
// }
//
// function getFilteredFiles(dir, pkg) {
//   let files = fs.readdirSync(dir, pkg)
//   files = files.filter(junk.not)
//   return files;
// }
//
// function getConfig() {
//   if (config)
//     return config
//
//   try {
//     config = JSON.parse(fs.readFileSync(resolvePath('config.json')), 'utf8')
//     return config
//   } catch (e) {
//     throw new Error('Cannot load config.json: ' + e)
//   }
// }
//
// function getCnConfig() {
//   if (config)
//     return config
//
//   try {
//     configCn = JSON.parse(fs.readFileSync(resolvePath('config-cn.json')), 'utf8')
//     return configCn
//   } catch (e) {}
// }
//
// function getSdkVariables() {
//   return {
//     SDK_URL: JSON.stringify(getSdkUrl()),
//     SDK_CONFIG: JSON.stringify(getConfig()),
//     SDK_LOCAL_ADDONS: JSON.stringify(readLocalAddons()),
//     API_KEY: JSON.stringify(getConfig().apiKey),
//     API_URL: JSON.stringify(getConfig().apiEndpoint),
//     API_ENDPOINT: JSON.stringify(getConfig().apiEndpoint + '/v1/'),
//     SANDBOX_URL: JSON.stringify(getConfig().apiSandboxEndpoint),
//     SANDBOX_ENDPOINT: JSON.stringify(getConfig().apiSandboxEndpoint + '/v1/')
//   }
// }
// // function getEnvironmentVariables() {
// //   return {
// //     'process.env.NODE_ENV': JSON.stringify(nodeEnv),
// //     'process.env.API_HOST': processenv('API_HOST') && JSON.stringify(processenv('API_HOST')),
// //     'process.env.API_PORT': processenv('API_PORT'),
// //     'process.env.STORAGE_HOST': processenv('STORAGE_HOST') && JSON.stringify(processenv('STORAGE_HOST')),
// //     'process.env.STORAGE_PORT': processenv('STORAGE_PORT'),
// //     'process.env.AUTH_IDENTITY_PROVIDER_URL': processenv('AUTH_IDENTITY_PROVIDER_URL') && JSON.stringify(processenv('AUTH_IDENTITY_PROVIDER_URL')),
// //     'process.env.AUTH_CLIENT_ID': processenv('AUTH_CLIENT_ID') && JSON.stringify(processenv('AUTH_CLIENT_ID'))
// //   };
// // };
//
//
// // function buildAddon(pkg, version) {
// //   addonBuilder(pkg, version)
// //     .then((jsons) => {
// //       callback(null, jsons)
// //     })
// //     .catch((errs) => {
// //       callback('Upload failed', errs)
// //     })
// // }
