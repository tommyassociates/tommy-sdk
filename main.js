var express = require("express")

var app = express();
var docs_handler = express.static(__dirname + '/public/');
app.use(docs_handler);
//  start the server
app.listen(4000);
