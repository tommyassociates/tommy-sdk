(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var api = window.tommy.api;

var API = {};

exports.default = API;

},{}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var IndexController = {
  init: function init(page) {
    console.log('initialize nurse booking addon');
    IndexController.bind(page);
    var $page = $$(page.container);
    var f7 = window.tommy.app.f7;
    f7.swiper($page.find('.swiper-container'), {
      pagination: '.swiper-pagination'
    });
  },
  bind: function bind(page) {
    IndexController.page = page;
  },
  uninit: function uninit() {
    IndexController.page = null;
    delete IndexController.page;
    console.log('uninitialize wallet addon');
  }
};

exports.default = IndexController;

},{"../api":1}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (code) {
  if (!code) return '';
  if (map[code]) return map[code];
  return '';
};

var map = {
  'AED': 'د.إ',
  'AFN': '؋',
  'ALL': 'L',
  'AMD': '֏',
  'ANG': 'ƒ',
  'AOA': 'Kz',
  'ARS': '$',
  'AUD': '$',
  'AWG': 'ƒ',
  'AZN': '₼',
  'BAM': 'KM',
  'BBD': '$',
  'BDT': '৳',
  'BGN': 'лв',
  'BHD': '.د.ب',
  'BIF': 'FBu',
  'BMD': '$',
  'BND': '$',
  'BOB': '$b',
  'BRL': 'R$',
  'BSD': '$',
  'BTC': '฿',
  'BTN': 'Nu.',
  'BWP': 'P',
  'BYR': 'Br',
  'BYN': 'Br',
  'BZD': 'BZ$',
  'CAD': '$',
  'CDF': 'FC',
  'CHF': 'CHF',
  'CLP': '$',
  'CNY': '¥',
  'COP': '$',
  'CRC': '₡',
  'CUC': '$',
  'CUP': '₱',
  'CVE': '$',
  'CZK': 'Kč',
  'DJF': 'Fdj',
  'DKK': 'kr',
  'DOP': 'RD$',
  'DZD': 'دج',
  'EEK': 'kr',
  'EGP': '£',
  'ERN': 'Nfk',
  'ETB': 'Br',
  'ETH': 'Ξ',
  'EUR': '€',
  'FJD': '$',
  'FKP': '£',
  'GBP': '£',
  'GEL': '₾',
  'GGP': '£',
  'GHC': '₵',
  'GHS': 'GH₵',
  'GIP': '£',
  'GMD': 'D',
  'GNF': 'FG',
  'GTQ': 'Q',
  'GYD': '$',
  'HKD': '$',
  'HNL': 'L',
  'HRK': 'kn',
  'HTG': 'G',
  'HUF': 'Ft',
  'IDR': 'Rp',
  'ILS': '₪',
  'IMP': '£',
  'INR': '₹',
  'IQD': 'ع.د',
  'IRR': '﷼',
  'ISK': 'kr',
  'JEP': '£',
  'JMD': 'J$',
  'JOD': 'JD',
  'JPY': '¥',
  'KES': 'KSh',
  'KGS': 'лв',
  'KHR': '៛',
  'KMF': 'CF',
  'KPW': '₩',
  'KRW': '₩',
  'KWD': 'KD',
  'KYD': '$',
  'KZT': 'лв',
  'LAK': '₭',
  'LBP': '£',
  'LKR': '₨',
  'LRD': '$',
  'LSL': 'M',
  'LTC': 'Ł',
  'LTL': 'Lt',
  'LVL': 'Ls',
  'LYD': 'LD',
  'MAD': 'MAD',
  'MDL': 'lei',
  'MGA': 'Ar',
  'MKD': 'ден',
  'MMK': 'K',
  'MNT': '₮',
  'MOP': 'MOP$',
  'MRO': 'UM',
  'MRU': 'UM',
  'MUR': '₨',
  'MVR': 'Rf',
  'MWK': 'MK',
  'MXN': '$',
  'MYR': 'RM',
  'MZN': 'MT',
  'NAD': '$',
  'NGN': '₦',
  'NIO': 'C$',
  'NOK': 'kr',
  'NPR': '₨',
  'NZD': '$',
  'OMR': '﷼',
  'PAB': 'B/.',
  'PEN': 'S/.',
  'PGK': 'K',
  'PHP': '₱',
  'PKR': '₨',
  'PLN': 'zł',
  'PYG': 'Gs',
  'QAR': '﷼',
  'RMB': '￥',
  'RON': 'lei',
  'RSD': 'Дин.',
  'RUB': '₽',
  'RWF': 'R₣',
  'SAR': '﷼',
  'SBD': '$',
  'SCR': '₨',
  'SDG': 'ج.س.',
  'SEK': 'kr',
  'SGD': '$',
  'SHP': '£',
  'SLL': 'Le',
  'SOS': 'S',
  'SRD': '$',
  'SSP': '£',
  'STD': 'Db',
  'STN': 'Db',
  'SVC': '$',
  'SYP': '£',
  'SZL': 'E',
  'THB': '฿',
  'TJS': 'SM',
  'TMT': 'T',
  'TND': 'د.ت',
  'TOP': 'T$',
  'TRL': '₤',
  'TRY': '₺',
  'TTD': 'TT$',
  'TVD': '$',
  'TWD': 'NT$',
  'TZS': 'TSh',
  'UAH': '₴',
  'UGX': 'USh',
  'USD': '$',
  'UYU': '$U',
  'UZS': 'лв',
  'VEF': 'Bs',
  'VND': '₫',
  'VUV': 'VT',
  'WST': 'WS$',
  'XAF': 'FCFA',
  'XBT': 'Ƀ',
  'XCD': '$',
  'XOF': 'CFA',
  'XPF': '₣',
  'YER': '﷼',
  'ZAR': 'R',
  'ZWD': 'Z$'
};

},{}],4:[function(require,module,exports){
'use strict';

var _index = require('./controllers/index');

var _index2 = _interopRequireDefault(_index);

var _currencyMap = require('./currency-map');

var _currencyMap2 = _interopRequireDefault(_currencyMap);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _window$tommy$app = window.tommy.app,
    f7 = _window$tommy$app.f7,
    t7 = _window$tommy$app.t7;

// == Router

f7.onPageInit('nurse_booking__index', _index2.default.init);
f7.onPageBeforeRemove('nurse_booking__index', _index2.default.uninit);

t7.registerHelper('wallet__currencySymbol', function (code) {
  return (0, _currencyMap2.default)(code);
});

},{"./controllers/index":2,"./currency-map":3}]},{},[4]);
