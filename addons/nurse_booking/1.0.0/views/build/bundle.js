(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var api = window.tommy.api;

var API = {
  cache: {
    services: [],
    coupons: [],
    locations: [],
    booking: {}
  },
  getServiceList: function getServiceList(categoryId) {
    return api.call({
      endpoint: 'vendors/1/products',
      method: 'GET',
      data: {}
    }).then(function (data) {
      API.cache.services = data;
      return data;
    });
  },
  getCouponList: function getCouponList(categoryId) {
    return api.call({
      endpoint: 'vendors/1/coupons',
      method: 'GET',
      data: {}
    }).then(function (data) {
      API.cache.coupons = data;
      return data;
    });
  },
  getLocations: function getLocations() {
    return api.call({
      endpoint: 'addons/nurse_booking/install/settings/locations',
      method: 'GET'
    }).then(function (res) {
      API.cache.locations = res.data && res.data.locations ? res.data.locations : [];
      return API.cache.locations;
    });
  },
  saveLocations: function saveLocations(locations) {
    if (!locations) {
      locations = API.cache.locations;
    } else {
      API.cache.locations = locations;
    }
    return api.call({
      endpoint: 'addons/nurse_booking/install/settings/locations',
      method: 'PUT',
      data: { data: JSON.stringify({ locations: locations }) }
    }).then(function (res) {
      return res.data.locations;
    });
  },
  addLocation: function addLocation(location) {
    if (location.default) {
      API.cache.locations.forEach(function (loc) {
        loc.default = false;
      });
      API.cache.locations.unshift(location);
    } else {
      API.cache.locations.push(location);
    }
    return API.saveLocations(API.cache.locations);
  },
  removeLocation: function removeLocation(index) {
    API.cache.locations.splice(index, 1);
    return API.saveLocations(API.cache.locations);
  }
};

exports.default = API;

},{}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var tommy = window.tommy;

var DateTimeController = {
  init: function init(page) {
    DateTimeController.renderDates();
    DateTimeController.renderHours();
    DateTimeController.bind(page);
  },
  bind: function bind(page) {
    DateTimeController.page = page;
    var $page = $$(page.container);

    $page.on('change', 'input[name="date-time-date"]', function (e) {
      DateTimeController.renderHours(new Date(parseInt(e.target.value, 10)));
    });
    $page.on('click', '.date-time-select-button', function (e) {
      var date = $page.find('input[name="date-time-date"]:checked').val();
      var hours = $page.find('input[name="date-time-hours"]:checked').val();

      _api2.default.cache.booking.date_time = new Date(parseInt(date, 10)).getTime() + hours * 60 * 60 * 1000;

      var url = tommy.util.addonAssetUrl(Template7.global.currentAddonInstall.package, Template7.global.currentAddonInstall.version, 'views/nurse-list.html', true);
      tommy.app.f7.views.main.loadPage({ url: url });
    });
  },
  renderDates: function renderDates() {
    var now = new Date().getTime();
    var dates = [];

    for (var i = 0; i <= 13; i += 1) {
      var date = new Date(now + i * 24 * 60 * 60 * 1000);
      var month = date.getMonth() + 1;
      var day = date.getDate();
      if (day < 10) day = '0' + day;
      if (month < 10) month = '0' + month;
      var weekDay = date.getDay();
      dates.push({
        value: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
        day: day,
        month: month,
        weekDay: tommy.i18n.t('date_time.week_days.' + weekDay),
        today: i === 0
      });
    };
    tommy.tplManager.renderInline('nurse_booking__dateTimeDatesTemplate', { dates: dates });
  },
  renderHours: function renderHours() {
    var date = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : new Date();

    var hours = [];
    var today = new Date();
    var isToday = void 0;
    var wasChecked = void 0;
    if (today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth() && today.getDate() === date.getDate()) {
      isToday = true;
    }
    for (var i = 10; i <= 19; i += 1) {
      var disabled = isToday ? today.getHours() >= i : false;
      var checked = false;
      if (!disabled && !wasChecked) {
        checked = true;
        wasChecked = true;
      }
      hours.push({
        value: i,
        disabled: disabled,
        checked: checked,
        hour: i + ':00'
      });
    }
    tommy.tplManager.renderInline('nurse_booking__dateTimeHoursTemplate', { hours: hours });
  },
  uninit: function uninit() {
    DateTimeController.page = null;
    delete DateTimeController.page;
  }
};

exports.default = DateTimeController;

},{"../api":1}],3:[function(require,module,exports){
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

},{"../api":1}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var tommy = window.tommy;

var LocationController = {
  init: function init(page) {
    LocationController.loadLocations();
    LocationController.bind(page);
  },
  bind: function bind(page) {
    LocationController.page = page;
    var $page = $$(page.container);
    var f7 = tommy.app.f7;
    var service = _api2.default.cache.booking.service;

    // Delete
    $page.on('click', '.location-delete-button', function () {
      var index = parseInt($$(this).attr('data-location-index'), 10);
      _api2.default.removeLocation(index).then(function () {
        LocationController.render();
      });
    });

    // Save
    $page.on('click', '.location-save-button', function (e) {
      var $form = $$(this).parents('.location-add-form');
      var city = $form.find('input[name="city"]').val().trim();
      var address = $form.find('textarea[name="address"]').val().trim();
      var isDefault = $form.find('input[name="default"]').prop('checked');
      if (!city || !address) return;

      var available = void 0;
      (service.data.available_in || service.data.availabile_in || []).forEach(function (availableCity) {
        if (availableCity.toLowerCase() === city.toLowerCase()) available = true;
      });
      if (!available) {
        f7.alert(tommy.i18n.t('location.not_available'));
        return;
      }
      _api2.default.addLocation({ city: city, address: address, default: isDefault }).then(function () {
        LocationController.render();
      });
    });

    // Add
    $page.on('click', '.location-add-button', function (e) {
      $page.find('.page-content').append(tommy.tplManager.render('nurse_booking__locationsTemplate', { locations: [] }));
      $page.find('.location-add-button').hide();
    });

    // Select
    $page.on('click', '.location-select-button', function (e) {
      var index = parseInt($$(this).attr('data-location-index'), 10);
      var location = _api2.default.cache.locations[index];
      var city = location.city;
      var available = void 0;

      (service.data.available_in || service.data.availabile_in || []).forEach(function (availableCity) {
        if (availableCity.toLowerCase() === city.toLowerCase()) available = true;
      });
      if (!available) {
        f7.alert(tommy.i18n.t('location.not_available'));
        return;
      }
      var url = tommy.util.addonAssetUrl(Template7.global.currentAddonInstall.package, Template7.global.currentAddonInstall.version, 'views/date-time.html', true);
      _api2.default.cache.booking.location = location;
      f7.views.main.loadPage({ url: url });
    });
  },
  loadLocations: function loadLocations() {
    _api2.default.getLocations().then(function () {
      LocationController.render();
    });
  },
  render: function render() {
    tommy.tplManager.renderInline('nurse_booking__locationsTemplate', { locations: _api2.default.cache.locations });
  },
  uninit: function uninit() {
    LocationController.page = null;
    delete LocationController.page;
  }
};

exports.default = LocationController;

},{"../api":1}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var tommy = window.tommy;

var ServiceDetailsController = {
  init: function init(page) {
    ServiceDetailsController.bind(page);
  },
  bind: function bind(page) {
    ServiceDetailsController.page = page;

    var $page = $$(page.container);
    var f7 = tommy.app.f7;
    var id = page.query.id;

    var service = {};
    (_api2.default.cache.services || []).forEach(function (serviceData) {
      if (serviceData.id === parseInt(id, 10)) {
        service = serviceData;
        service.coupons = _api2.default.cache.coupons.filter(function (coupon) {
          return coupon.vendor_product_id === service.id;
        });
      }
    });

    // Navbar Title
    $$(page.navbarInnerContainer).find('.center').text(service.name);

    f7.sizeNavbars();

    // Template
    tommy.tplManager.renderTarget('nurse_booking__serviceDetailsTemplate', { service: service }, page.container);

    // Swiper
    f7.swiper($page.find('.swiper-container'), {
      pagination: '.swiper-pagination'
    });

    $$(page.container).on('click', '.service-book-button', function () {
      _api2.default.cache.booking.service = service;
    });
  },
  uninit: function uninit() {
    ServiceDetailsController.page = null;
    delete ServiceDetailsController.page;
  }
};

exports.default = ServiceDetailsController;

},{"../api":1}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var tommy = window.tommy;

var ServiceListController = {
  init: function init(page) {
    ServiceListController.bind(page);
    ServiceListController.loadServices();
  },
  bind: function bind(page) {
    ServiceListController.page = page;
  },
  loadServices: function loadServices() {
    var page = ServiceListController.page;
    var $page = $$(page.container);
    var f7 = tommy.app.f7;
    var category = page.query.category;

    // Navbar Title
    $$(page.navbarInnerContainer).find('.center').text(tommy.i18n.t('service_list.' + category.toLowerCase() + '_title'));

    f7.sizeNavbars();

    // Request services and coupons
    Promise.all([_api2.default.getServiceList(), _api2.default.getCouponList()]).then(function (_ref) {
      var _ref2 = _slicedToArray(_ref, 2),
          servicesData = _ref2[0],
          couponsData = _ref2[1];

      var services = servicesData.filter(function (el) {
        return el.category === category;
      });

      services.forEach(function (service) {
        service.coupons = couponsData.filter(function (coupon) {
          return coupon.vendor_product_id === service.id;
        });
      });

      // Template
      tommy.tplManager.renderInline('nurse_booking__serviceListTemplate', { services: services });

      // Swiper
      f7.swiper($page.find('.swiper-container'), {
        centeredSlides: true,
        slidesPerView: 'auto'
      });
    });
  },
  uninit: function uninit() {
    ServiceListController.page = null;
    delete ServiceListController.page;
  }
};

exports.default = ServiceListController;

},{"../api":1}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
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

},{}],9:[function(require,module,exports){
'use strict';

var _currencyMap = require('./currency-map');

var _currencyMap2 = _interopRequireDefault(_currencyMap);

var _couponPicker = require('./coupon-picker');

var _couponPicker2 = _interopRequireDefault(_couponPicker);

var _index = require('./controllers/index');

var _index2 = _interopRequireDefault(_index);

var _serviceList = require('./controllers/service-list');

var _serviceList2 = _interopRequireDefault(_serviceList);

var _serviceDetails = require('./controllers/service-details');

var _serviceDetails2 = _interopRequireDefault(_serviceDetails);

var _location = require('./controllers/location');

var _location2 = _interopRequireDefault(_location);

var _dateTime = require('./controllers/date-time');

var _dateTime2 = _interopRequireDefault(_dateTime);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _window$tommy$app = window.tommy.app,
    f7 = _window$tommy$app.f7,
    t7 = _window$tommy$app.t7;

// == Router

f7.onPageInit('nurse_booking__index', _index2.default.init);
f7.onPageBeforeRemove('nurse_booking__index', _index2.default.uninit);

f7.onPageInit('nurse_booking__service-list', _serviceList2.default.init);
f7.onPageBeforeRemove('nurse_booking__service-list', _serviceList2.default.uninit);

f7.onPageInit('nurse_booking__service-details', _serviceDetails2.default.init);
f7.onPageBeforeRemove('nurse_booking__service-details', _serviceDetails2.default.uninit);

f7.onPageInit('nurse_booking__location', _location2.default.init);
f7.onPageBeforeRemove('nurse_booking__location', _location2.default.uninit);

f7.onPageInit('nurse_booking__date-time', _dateTime2.default.init);
f7.onPageBeforeRemove('nurse_booking__date-time', _dateTime2.default.uninit);

t7.registerHelper('nurse_booking__currencySymbol', function (code) {
  return (0, _currencyMap2.default)(code);
});

},{"./controllers/date-time":2,"./controllers/index":3,"./controllers/location":4,"./controllers/service-details":5,"./controllers/service-list":6,"./coupon-picker":7,"./currency-map":8}]},{},[9]);
