(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var IndexController = {
  init: function init(page) {
    console.log('initialize vitals demo addon', page);
    window.tommy.tplManager.renderInline('temperature__sliderTemplate', null, page.container);

    var lastTapTime = 0;
    $$(page.container).click(function (e) {
      var timeDiff = new Date().getTime() - lastTapTime;
      if (timeDiff < 300) {
        window.tommy.app.f7view.router.back();
      }
      lastTapTime = new Date().getTime();
    });
  },
  uninit: function uninit() {
    console.log('uninitialize vitals demo addon');
  }
};

exports.default = IndexController;

},{}],2:[function(require,module,exports){
'use strict';

var _index = require('./controllers/index');

var _index2 = _interopRequireDefault(_index);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

//
// == Router

window.tommy.app.f7.onPageInit('temperature__index', _index2.default.init);
window.tommy.app.f7.onPageBack('temperature__index', _index2.default.uninit);

},{"./controllers/index":1}]},{},[2]);
