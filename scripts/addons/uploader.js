const fs = require('fs')
const path = require('path')
const helpers = require('../helpers')
const addonBuilder = require('./builder')
const addonArchiver = require('./archiver')


module.exports = async function(action, pkg, environment, version, callback) {

  await addonBuilder(pkg, environment, version)
  await addonArchiver(pkg, environment, version)

  const archivePath = helpers.archivePath(pkg, environment, version)  
  const endpoint = new URL(`/v1/addons/${action}`, process.env.TOMMY_API_URL)
  endpoint.searchParams.set('api_key', process.env.TOMMY_API_KEY)

  try {
    const form = new FormData()
    form.set('package', pkg)
    form.set('environment', environment)
    form.set('version', version)
    const archive = new Blob([await fs.promises.readFile(archivePath)], { type: 'application/zip' })
    form.set('archive', archive, path.basename(archivePath))

    console.log('uploading addon archive', endpoint.pathname, archivePath)
    const response = await fetch(endpoint, { method: 'POST', body: form })
    const body = await response.text()
    let result = body
    try { result = body ? JSON.parse(body) : null } catch (_) {}

    if (response.status !== 201) {
      const error = new Error(`addon upload failed with HTTP ${response.status}`)
      error.response = result
      throw error
    }

    console.log('addon uploaded', endpoint.pathname)
    callback(null, [result])
  } catch (error) {
    console.error('addon upload error', endpoint.pathname, error.message)
    callback(error.response || error.message, null)
  }
}
