const fs = require('fs')
const path = require('path')
const archiver = require('archiver')
const helpers = require('../helpers')

// function resolvePath(dir) {
//   return path.join(__dirname, '..', '..', dir)
// }

module.exports = function(pkg, environment, version) { //, callback
  const localAddonFilePath = helpers.getLocalAddonFilePath(pkg, environment, version, '')

  const archivePath = helpers.archivePath(pkg, environment, version)
  const outStream = fs.createWriteStream(archivePath)
  const archive = archiver('zip')

  return new Promise((resolve, reject) => {
    outStream.on('finish', () => {
      // if (callback) { callback(null, archivePath) }
      console.log('addon archive created', archivePath)
      resolve(archivePath)
    })

    archive.on('error', (err) => {
      // if (callback) { callback(err, null) }
      // callback = null;
      console.error('addon archive failed', pkg, environment, version)
      reject(err)
    })

    archive.pipe(outStream)
    archive.directory(localAddonFilePath, '/')
    archive.finalize()
  })
}
