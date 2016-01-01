var express = require('express'),
  fs = require('fs'),
  path = require('path'),
  app = express();

app.set('port', 4000);
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.static('./'));

app.get('/', function(req, res) {
  res.render('index', {
    localExtensions: readExtensionList(),
    apiKey: readAPIKey()
  });
});

app.listen(app.get('port'), function() {
  console.log('Server listening on port ' + app.get('port'));
});

function readAPIKey() {
  return String(fs.readFileSync(path.join(__dirname, './APIKEY'))).trim();
}

function readExtensionList() {
  //list = fs.readdirSync(path.join(__dirname, './extensions'));
  return fs.readdirSync(path.join(__dirname, './extensions'));
}
