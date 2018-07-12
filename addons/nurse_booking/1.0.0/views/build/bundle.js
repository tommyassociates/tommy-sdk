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

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var PackageDetailsController = {
  init: function init(page) {
    PackageDetailsController.bind(page);

    var $page = $$(page.container);
    var f7 = window.tommy.app.f7;
    f7.swiper($page.find('.swiper-container'), {
      pagination: '.swiper-pagination'
    });
  },
  bind: function bind(page) {
    PackageDetailsController.page = page;
  },
  uninit: function uninit() {
    PackageDetailsController.page = null;
    delete PackageDetailsController.page;
  }
};

exports.default = PackageDetailsController;

},{"../api":1}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var PackageListController = {
  init: function init(page) {
    PackageListController.bind(page);
    var $page = $$(page.container);
    var f7 = window.tommy.app.f7;

    f7.swiper($page.find('.swiper-container'), {
      centeredSlides: true,
      slidesPerView: 'auto'
    });
  },
  bind: function bind(page) {
    PackageListController.page = page;
  },
  uninit: function uninit() {
    PackageListController.page = null;
    delete PackageListController.page;
  }
};

exports.default = PackageListController;

},{"../api":1}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (confirm, skip) {
  // TODO: get API request for avialable coupons first

  var f7 = window.tommy.app.f7;
  var currentCouponId = void 0;
  var html = tommy.tplManager.render('nurse_bookink__couponPickerTemplate', {
    items: [{
      title: 'Title 1',
      date: '13.07.2018 - 15.07.2018',
      id: 1
    }, {
      title: 'Title 2',
      date: '13.07.2018 - 15.07.2018',
      id: 2
    }, {
      title: 'Title 3',
      date: '13.07.2018 - 15.07.2018',
      id: 3
    }]
  });
  var modalEl = f7.modal({
    afterText: html,
    buttons: [{
      text: tommy.i18n.t('coupon_picker.skip_button', { defaultValue: 'Skip' }),
      onClick: function onClick() {
        if (skip) skip();
      }
    }, {
      text: tommy.i18n.t('coupon_picker.confirm_button', { defaultValue: 'Confirm' }),
      bold: true,
      onClick: function onClick() {
        if (confirm) confirm(currentCouponId);
      }
    }]
  });
  var $modalEl = $$(modalEl);
  $modalEl.addClass('nurse_booking-coupon-picker-modal');
  $modalEl.find('.modal-button-bold').addClass('modal-button-disabled');
  $modalEl.find('input').on('change', function (e) {
    $modalEl.find('.modal-button-bold').removeClass('modal-button-disabled');
    if (e.target.checked) {
      currentCouponId = e.target.value;
    }
  });
};

},{}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
'use strict';

var _currencyMap = require('./currency-map');

var _currencyMap2 = _interopRequireDefault(_currencyMap);

var _couponPicker = require('./coupon-picker');

var _couponPicker2 = _interopRequireDefault(_couponPicker);

var _index = require('./controllers/index');

var _index2 = _interopRequireDefault(_index);

var _packageList = require('./controllers/package-list');

var _packageList2 = _interopRequireDefault(_packageList);

var _packageDetails = require('./controllers/package-details');

var _packageDetails2 = _interopRequireDefault(_packageDetails);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// TODO: remove that after testing
window.couponPicker = _couponPicker2.default;

var _window$tommy$app = window.tommy.app,
    f7 = _window$tommy$app.f7,
    t7 = _window$tommy$app.t7;

// == Router

f7.onPageInit('nurse_booking__index', _index2.default.init);
f7.onPageBeforeRemove('nurse_booking__index', _index2.default.uninit);

f7.onPageInit('nurse_booking__package-list', _packageList2.default.init);
f7.onPageBeforeRemove('nurse_booking__package-list', _packageList2.default.uninit);

f7.onPageInit('nurse_booking__package-details', _packageDetails2.default.init);
f7.onPageBeforeRemove('nurse_booking__package-details', _packageDetails2.default.uninit);

t7.registerHelper('nurse_booking__currencySymbol', function (code) {
  return (0, _currencyMap2.default)(code);
});

},{"./controllers/index":2,"./controllers/package-details":3,"./controllers/package-list":4,"./coupon-picker":5,"./currency-map":6}]},{},[7]);
