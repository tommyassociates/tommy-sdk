var express = require('express'),
  fs = require('fs'),
  path = require('path'),
  app = express(),
  apiKey = String(fs.readFileSync(path.join(__dirname, './APIKEY'))).trim();

app.set('port', 4000);
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.static('./'));

app.get('/', function (req, res) {
  res.render('index', {
    apiKey: apiKey
  });
});

app.listen(app.get('port'), function () {
  console.log('Server listening on port ' + app.get('port'));
});
