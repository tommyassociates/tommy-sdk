/* eslint no-console: off */
/* eslint no-shadow: off */
/* eslint no-empty: off */
/* eslint no-param-reassign: off */

const express = require('express');
const fs = require('fs');
const junk = require('junk');
const yaml = require('js-yaml');
const path = require('path');
const url = require('url');
const request = require('request');
const archiver = require('archiver');

const app = express();

function loadConfig(filepath) {
  return JSON.parse(
    fs.readFileSync(filepath).toString().replace( //
      new RegExp('\\/\\*(.|\\r|\\n)*?\\*\\/', 'g'),
      '' // strip out comments
    )
  );
}

const config = loadConfig('config.json');

function getFilteredFiles(folder, pkg) {
  let files = fs.readdirSync(folder, pkg);
  files = files.filter(junk.not);
  return files;
}


function createAddon(host, action, pkg, version, archivePath, callback) {
  const url = `${host}/v1/addons/${action}?api_key=${config.apiKey}`;
  request.post({
    url,
    formData: {
      package: pkg,
      version,
      archive: fs.createReadStream(archivePath),
    },
  }, (err, httpResponse, body) => {
    if (!err && httpResponse.statusCode === 201) {
      callback(null, JSON.parse(body));
    } else {
      let errMessage = {};
      try {
        errMessage = JSON.parse(body);
      } catch (e) {}
      callback(err || 'Upload failed', errMessage);
    }
  });
}

function readLocalAddonVersions() {
  const addons = {};
  const packages = getFilteredFiles(path.join(__dirname, 'addons'));
  for (let i = 0; i < packages.length; i += 1) {
    addons[packages[i]] = getFilteredFiles(path.join(__dirname, 'addons', packages[i]));
  }
  return addons;
}

function getLocalAddonFilePath(pkg, version, file) {
  return path.join(__dirname, 'addons', pkg, version, file);
}

function getSdkUrl() {
  return `http://localhost:${app.get('port')}`;
  // url.resolve()
}

function readLocalAddon(pkg, version) {
  const addon = yaml.safeLoad(fs.readFileSync(getLocalAddonFilePath(pkg, version, 'manifest.yml'), 'utf8'));
  const base = `/addons/${addon.package}/versions/${addon.version}/files/`;
  addon.url = url.resolve(getSdkUrl(), base);
  addon.icon_url = url.resolve(addon.url, 'icon.png'); // path + '/icon.png'
  addon.file_base_url = url.resolve(getSdkUrl(), base);
  addon.local = true;

  if (addon.assets) {
    addon.assets.forEach((asset) => {
      asset.url = url.resolve(addon.url, asset.file);
    });
  }

  if (addon.views) {
    const views = [];
    Object.keys(addon.views).forEach((id) => {
      const view = addon.views[id];
      view.id = id;
      if (view.url) view.url = url.resolve(addon.url, view.file);
      view.local = true;
      if (view.assets) {
        for (let x = 0; x < view.assets.length; x += 1) {
          const asset = view.assets[x];
          asset.url = url.resolve(addon.url, asset.file);
        }
      }
      views.push(view);
    });

    // convert views to an array
    addon.views = views;
  }
  return addon;
}

function readLocalAddons() {
  const addons = [];
  const data = readLocalAddonVersions();
  Object.keys(data).forEach((pkg) => {
    const versions = data[pkg];
    for (let i = 0; i < versions.length; i += 1) {
      const manifest = readLocalAddon(pkg, versions[i]);
      // console.log(manifest)
      addons.push(manifest);
    }
  });
  return addons;
}

function createAddonArchive(pkg, version, callback) {
  const archivePath = path.join(__dirname, 'archives', `${pkg}-${version}.zip`);
  const outStream = fs.createWriteStream(archivePath);
  const archive = archiver('zip');

  outStream.on('finish', () => {
    if (callback) { callback(null, archivePath); }
  });

  archive.on('error', (err) => {
    if (callback) { callback(err, null); }
    callback = null;
  });

  archive.pipe(outStream);
  archive.directory(path.join(__dirname, 'addons', pkg, version), '/');
  archive.finalize();
}

app.set('port', 4002);
app.set('view engine', 'ejs');
app.use(express.static('www'));
app.use(express.static('./'));

app.get('/', (req, res) => {
  res.render('index', {
    localAddons: readLocalAddons(),
    config,
    url: getSdkUrl(),
  });
});

app.get('/addons', (req, res) => {
  res.send(readLocalAddons());
});

app.get('/addons/:package/:version', (req, res) => {
  res.send(readLocalAddon(req.params.package, req.params.version));
});

app.get('/addons/:package/versions/:version/files/*', (req, res) => {
  res.sendFile(getLocalAddonFilePath(req.params.package, req.params.version, req.params['0']));
});

app.post('/addon/archive/:package/:version', (req, res) => {
  createAddonArchive(req.params.package, req.params.version, (err, archivePath) => {
    console.log('Created archive', archivePath);
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(archivePath);
    }
  });
});

app.post('/addon/sandbox/upload/:package/:version', (req, res) => {
  const pkg = req.params.package;


  const version = req.params.version;
  createAddonArchive(pkg, version, (err, archivePath) => {
    console.log('Created archive', archivePath);
    createAddon(config.apiSandboxEndpoint, 'upload', pkg, version, archivePath, (err, json) => {
      console.log('Uploaded archive', err, json);
      if (err) {
        res.status(500).send(err);
      } else {
        res.send(json);
      }
    });
  });
});

app.post('/addon/sandbox/update/:package/:version', (req, res) => {
  const pkg = req.params.package;


  const version = req.params.version;
  createAddonArchive(pkg, version, (err, archivePath) => {
    console.log('Created archive', archivePath);
    createAddon(config.apiSandboxEndpoint, 'update', pkg, version, archivePath, (err, json) => {
      console.log('Uploaded archive', err, json);
      if (err) {
        res.status(500).send(err);
      } else {
        res.send(json);
      }
    });
  });
});

app.post('/addon/store/submit/:package/:version', (req, res) => {
  const pkg = req.params.package;


  const version = req.params.version;
  createAddonArchive(pkg, version, (err, archivePath) => {
    console.log('Created archive', archivePath);
    createAddon(config.apiEndpoint, 'submit', pkg, version, archivePath, (err, json) => {
      console.log('Uploaded archive', err, json);
      if (err) {
        res.status(500).send(err);
      } else {
        res.send(json);
      }
    });
  });
});

app.listen(app.get('port'), () => {
  console.log('Server listening on port', app.get('port'));
});
