var express = require('express'),
  fs = require('fs'),
  yaml = require('js-yaml'),
  path = require('path'),
  url = require('url'),
  request = require('request'),
  config = loadConfig('config.json'),
  app = express()

app.set('port', 4001)
app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(express.static('./'))

app.get('/', function(req, res) {
  res.render('index', {
    localAddons: readLocalAddons(),
    config: config,
    url: getSdkUrl()
  })
})

app.get('/addons', function(req, res) {
  res.send(readLocalAddons())
})

app.get('/addons/:package/:version', function(req, res) {
  res.send(readLocalAddon(req.params.package, req.params.version))
})

app.get('/addons/:package/versions/:version/files/*', function(req, res) {
  res.sendFile(getLocalAddonFilePath(req.params.package, req.params.version, req.params['0']))
})

app.post('/addon/archive/:package/:version', function(req, res) {
  createAddonArchive(req.params.package, req.params.version, function(err, archivePath) {
    console.log('Created archive', archivePath)
    if (err) {
      res.status(500).send(err)
    }
    else {
      res.status(200).send(archivePath)
    }
  })
})

app.post('/addon/sandbox/upload/:package/:version', function(req, res) {
  var package = req.params.package,
    version = req.params.version
  createAddonArchive(package, version, function(err, archivePath) {
    console.log('Created archive', archivePath)
    createAddon(config.apiSandboxEndpoint, 'upload', package, version, archivePath, function(err, json) {
      console.log('Uploaded archive', err, json)
      if (err) {
        res.status(500).send(err)
      }
      else {
        res.send(json)
      }
    })
  })
})

app.post('/addon/store/submit/:package/:version', function(req, res) {
  var package = req.params.package,
    version = req.params.version
  createAddonArchive(package, version, function(err, archivePath) {
    console.log('Created archive', archivePath)
    createAddon(config.apiEndpoint, 'submit', package, version, archivePath, function(err, json) {
      console.log('Uploaded archive', err, json)
      if (err) {
        res.status(500).send(err)
      }
      else {
        res.send(json)
      }
    })
  })
})

app.listen(app.get('port'), function() {
  console.log('Server listening on port', app.get('port'))
})

//
/// Helpers

function loadConfig(filepath) {
  return JSON.parse(
    fs.readFileSync(filepath).toString().replace( //
      new RegExp("\\/\\*(.|\\r|\\n)*?\\*\\/", "g"),
      "" // strip out comments
    )
  )
}

function createAddon(host, action, package, version, archivePath, callback) {
  request.post({
    url: host + '/v1/addons/' + action + '?api_key=' + config.apiKey,
    formData: {
      package: package,
      version: version,
      archive: fs.createReadStream(archivePath) }
  }, function(err, httpResponse, body) {
    if (!err && httpResponse.statusCode == 201) {
      callback(null, JSON.parse(body))
    }
    else {
      callback(err || 'Upload failed', null)
    }
  })
}

function readLocalAddonVersions() {
  var addons = {}
  var packages = fs.readdirSync(path.join(__dirname, 'addons'))
  for (var i = 0; i < packages.length; i++) {
    addons[packages[i]] = fs.readdirSync(path.join(__dirname, 'addons', packages[i]))
  }
  return addons
}

function getLocalAddonFilePath(package, version, file) {
  return path.join(__dirname, 'addons', package, version, file)
}

function getSdkUrl() {
  return 'http://localhost:' + app.get('port')
  // url.resolve()
}

function readLocalAddon(package, version) {
  var addon =  yaml.safeLoad(fs.readFileSync(getLocalAddonFilePath(package, version, 'manifest.yml'), 'utf8'))
  var base = '/addons/' + addon.package + '/versions/' + addon.version + '/files/'
  addon.url = url.resolve(getSdkUrl(), base)
  addon.icon_url =  url.resolve(addon.url, 'icon.png') //path + '/icon.png'
  addon.local = true
  if (addon.views) {
    var views = []
    for (var id in addon.views) {
      var view = addon.views[id]
      view.id = id
      view.url = url.resolve(addon.url, view.file)
      if (view.assets) {
        for (var x = 0; x < view.assets.length; x++) {
          var asset = view.assets[x]
          asset.url = url.resolve(addon.url, asset.file)
        }
      }
      views.push(view)
    }

    // convert views to an array
    addon.views = views
  }
  return addon
}

function readLocalAddons() {
  var addons = []
  var data = readLocalAddonVersions()
  for (var package in data) {
    var versions = data[package]
    for (var i = 0; i < versions.length; i++) {
      var manifest = readLocalAddon(package, versions[i])
      // console.log(manifest)
      addons.push(manifest)
    }
  }
  return addons
}

function createAddonArchive(package, version, callback) {
  var archivePath = path.join(__dirname, 'archives', package + '-' + version + '.zip'),
    outStream = fs.createWriteStream(archivePath),
    archiver = require('archiver'),
    archive = archiver('zip')

  outStream.on('finish', function() {
    if (callback)
      callback(null, archivePath)
  })

  archive.on('error', function(err) {
    if (callback)
      callback(err, null)
    callback = null
  })

  archive.pipe(outStream)
  archive.directory(path.join(__dirname, 'addons', package, version), '/')
  archive.finalize()
}
