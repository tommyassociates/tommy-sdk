// var express = require("express")
//
// var app = express();
// var docs_handler = express.static(__dirname + '/public/');
// app.use(docs_handler);
// //  start the server
// app.listen(4000);
var express = require('express'),
  fs = require('fs'),
  path = require('path'),
  // redis = require('redis'),
  // client = redis.createClient(),
  app = express(),
  apiKey = String(fs.readFileSync(path.join(__dirname, './APIKEY'))).trim();
  // serverPort = parseInt(sy.config.port)
  // clientPort = serverPort - 1;

app.set('port', 4000);
app.set('view engine', 'ejs');
// app.set('views', './');
app.use(express.static('public'));
// app.use(express.static('./'));
// app.use(express.static('../'));

app.get('/', function (req, res) {
  // // Create a random token to identify this client
  // // NOTE: This method of generating unique tokens is not secure, so don't use
  // // it in production ;)
  // var token = '' + Math.random();
  //
  // // Create the arbitrary user session object here
  // var session = {
  //   // user: 'demo',
  //   // name: 'Demo User',
  //   group: 'public'
  // }
  //
  // // Store the user session on Redis
  // // This will be sent to the Symple server to authenticate the session
  // client.set('symple:session:' + token, JSON.stringify(session), redis.print);



  // Render the response
  res.render('index', {
    apiKey: apiKey
    // port: serverPort,
    // token: token,
    // peer: session
  });
});

app.listen(app.get('port'), function () {
  console.log('Express server listening on port ' + app.get('port'));
});
