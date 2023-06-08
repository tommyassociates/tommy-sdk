const fs = require('fs')
const request = require('request')
// const url = require('url')
const helpers = require('../helpers')
const addonBuilder = require('./builder')
const addonArchiver = require('./archiver')


module.exports = async function(action, pkg, environment, version, callback) {

  await addonBuilder(pkg, environment, version)
  await addonArchiver(pkg, environment, version)

  const archivePath = helpers.archivePath(pkg, environment, version)  
  const urls = [];
  urls.push(`${process.env.TOMMY_API_URL}/v1/addons/${action}?api_key=${process.env.TOMMY_API_KEY}`)
  const promises = urls.map(url => new Promise((resolve, reject) => {
    console.log('uploading to ', url, archivePath)
    request.post({
      url,
      formData: {
        package: pkg,
        environment,
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
