(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var tommy = window.tommy;
var api = tommy.api;

var API = {
  cache: {
    services: [],
    coupons: [],
    locations: [],
    booking: {}
  },
  getServiceList: function getServiceList(categoryId) {
    return api.call({
      endpoint: 'vendors/' + tommy.config.getCurrentTeamId() + '/products',
      method: 'GET',
      data: {}
    }).then(function (data) {
      API.cache.services = data;
      return data;
    });
  },
  getServiceDetails: function getServiceDetails(id) {
    return api.call({
      endpoint: 'vendors/' + tommy.config.getCurrentTeamId() + '/products/' + id,
      method: 'GET'
    }).then(function (data) {
      return data;
    });
  },
  getCouponList: function getCouponList(categoryId) {
    return api.call({
      endpoint: 'vendors/' + tommy.config.getCurrentTeamId() + '/coupons',
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
      API.cache.locations = res && res.data && res.data.locations ? res.data.locations : [];
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
  },
  sendOrder: function sendOrder(data) {
    return api.call({
      endpoint: 'vendors/' + tommy.config.getCurrentTeamId() + '/orders',
      method: 'POST',
      data: data
    });
  },
  getOrdersHistory: function getOrdersHistory() {
    return api.call({
      endpoint: 'vendors/' + tommy.config.getCurrentTeamId() + '/orders/',
      method: 'GET'
    }).then(function (data) {
      API.cache.orders = data;
      return data;
    });
  },
  getOrderDetails: function getOrderDetails(id) {
    return api.call({
      endpoint: 'vendors/' + tommy.config.getCurrentTeamId() + '/orders/' + id + '?with_wallet_transaction=true ',
      method: 'GET'
    }).then(function (data) {
      return data;
    });
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
    var f7 = tommy.app.f7;

    $page.on('change', 'input[name="date-time-date"]', function (e) {
      DateTimeController.renderHours(new Date(parseInt(e.target.value, 10)));
    });
    $page.on('click', '.date-time-select-button', function (e) {
      var date = $page.find('input[name="date-time-date"]:checked').val();
      var hours = $page.find('input[name="date-time-hours"]:checked').val();

      _api2.default.cache.booking.date = new Date(parseInt(date, 10)).getTime() + hours * 60 * 60 * 1000;

      if (page.query.back) {
        f7.views.main.back();
      } else {
        var url = tommy.util.addonAssetUrl(Template7.global.currentAddonInstall.package, Template7.global.currentAddonInstall.version, 'views/order-confirm.html', true);
        tommy.app.f7.views.main.loadPage({ url: url });
      }
    });
  },
  renderDates: function renderDates() {
    var nowDate = new Date();
    var now = nowDate.getTime();
    var dates = [];

    var todayDisabled = void 0;
    for (var i = 0; i <= 13; i += 1) {
      var date = new Date(now + i * 24 * 60 * 60 * 1000);
      var month = date.getMonth() + 1;
      var day = date.getDate();
      if (day < 10) day = '0' + day;
      if (month < 10) month = '0' + month;
      var weekDay = date.getDay();
      var today = i === 0;
      var disabled = today ? nowDate.getHours() >= 19 : false;
      if (disabled) {
        todayDisabled = true;
      }
      var checked = todayDisabled ? i === 1 : today;
      dates.push({
        disabled: disabled,
        value: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
        day: day,
        month: month,
        weekDay: tommy.i18n.t('date_time.week_days.' + weekDay),
        today: today,
        checked: checked
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
    if (isToday && today.getHours() >= 19) {
      DateTimeController.renderHours(new Date(today.getTime() + 24 * 60 * 60 * 1000));
      return;
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

var tommy = window.tommy;

var HistoryController = {
  init: function init(page) {
    HistoryController.bind(page);
    HistoryController.loadHistory();
  },
  bind: function bind(page) {
    HistoryController.page = page;
  },
  loadHistory: function loadHistory() {
    var page = HistoryController.page;
    var $page = $$(page.container);
    var f7 = tommy.app.f7;

    _api2.default.getOrdersHistory().then(function (orders) {
      orders.forEach(function (order) {
        order.statusKey = 'history.status_' + order.status;
        if (order.data && order.data.date) {
          if (!Number.isNaN(parseInt(order.data.date, 10))) {
            order.data.date = parseInt(order.data.date, 10);
          }
        }
      });
      var ordersSorted = orders.sort(function (a, b) {
        if (b.id > a.id) return 1;
        if (b.id < a.id) return -1;
        return 0;
      });
      tommy.tplManager.renderInline('nurse_booking__historyTemplate', { orders: ordersSorted });
    });
  },
  uninit: function uninit() {
    HistoryController.page = null;
    delete HistoryController.page;
  }
};

exports.default = HistoryController;

},{"../api":1}],4:[function(require,module,exports){
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
    console.log('uninitialize nurse booking addon');
  }
};

exports.default = IndexController;

},{"../api":1}],5:[function(require,module,exports){
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

      _api2.default.cache.booking.location = location;

      if (page.query.back) {
        f7.views.main.back();
      } else {
        var url = tommy.util.addonAssetUrl(Template7.global.currentAddonInstall.package, Template7.global.currentAddonInstall.version, 'views/date-time.html', true);
        f7.views.main.loadPage({ url: url });
      }
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

},{"../api":1}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

var _couponPicker = require('../coupon-picker');

var _couponPicker2 = _interopRequireDefault(_couponPicker);

var _payOrder = require('../pay-order');

var _payOrder2 = _interopRequireDefault(_payOrder);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var tommy = window.tommy;

var OrderConfirmController = {
  init: function init(page) {
    OrderConfirmController.bind(page);
    OrderConfirmController.render();
  },
  bind: function bind(page) {
    OrderConfirmController.page = page;
    var $page = $$(page.container);
    var f7 = tommy.app.f7;

    var service = _api2.default.cache.booking.service;


    $page.on('click', 'a.order-confirm-select-coupon', function () {
      (0, _couponPicker2.default)(service.coupons, function (coupon) {
        _api2.default.cache.booking.coupon = coupon;
        OrderConfirmController.render();
      }, function () {}, _api2.default.cache.booking.coupon);
    });

    $page.on('click', 'a.order-confirm-pay-button', function () {
      OrderConfirmController.pay();
    });
  },
  onBeforeIn: function onBeforeIn(page) {
    if (page.from === 'left') {
      setTimeout(function () {
        OrderConfirmController.render();
      }, 0);
    }
  },
  render: function render() {
    var _API$cache$booking = _api2.default.cache.booking,
        service = _API$cache$booking.service,
        coupon = _API$cache$booking.coupon,
        location = _API$cache$booking.location,
        date = _API$cache$booking.date;

    tommy.tplManager.renderInline('nurse_booking__orderConfirmTemplate', {
      user: window.tommy.config.getCurrentUser(),
      service: service,
      coupon: coupon,
      total: service.price - (coupon ? coupon.amount : 0),
      location: location,
      date: date
    });
  },
  pay: function pay() {
    var _API$cache$booking2 = _api2.default.cache.booking,
        service = _API$cache$booking2.service,
        coupon = _API$cache$booking2.coupon,
        location = _API$cache$booking2.location,
        date = _API$cache$booking2.date;

    var total = service.price - (coupon ? coupon.amount : 0);

    (0, _payOrder2.default)({
      productName: service.name,
      productId: service.id,
      total: total,
      couponId: coupon ? coupon.id : null,
      discount: coupon ? coupon.amount : 0,
      location: location,
      date: date
    });
  },
  uninit: function uninit() {
    OrderConfirmController.page = null;
    delete OrderConfirmController.page;
  }
};

exports.default = OrderConfirmController;

},{"../api":1,"../coupon-picker":10,"../pay-order":13}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

var _payOrder2 = require('../pay-order');

var _payOrder3 = _interopRequireDefault(_payOrder2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var tommy = window.tommy;

var OrderDetailsController = {
  init: function init(page) {
    OrderDetailsController.bind(page);
    OrderDetailsController.loadOrder();
  },
  bind: function bind(page) {
    OrderDetailsController.page = page;
    var $page = $$(page.container);
    $page.on('click', '.order-details-pay-button', function () {
      OrderDetailsController.payOrder();
    });
    $page.on('click', '.order-details-repeat-button', function () {
      OrderDetailsController.repeatOrder();
    });
    $page.on('click', '.order-details-cancel-button', function () {
      OrderDetailsController.cancelOrder();
    });
  },
  loadOrder: function loadOrder() {
    var page = OrderDetailsController.page;

    if (!page.query.id) {
      var _API$cache$booking = _api2.default.cache.booking,
          transaction = _API$cache$booking.transaction,
          service = _API$cache$booking.service,
          coupon = _API$cache$booking.coupon,
          location = _API$cache$booking.location,
          date = _API$cache$booking.date;

      OrderDetailsController.render({
        service: service,
        coupon: coupon,
        total: service.price - (coupon ? coupon.amount : 0),
        location: location,
        date: date,
        transaction: transaction
      });
    } else {
      _api2.default.getOrderDetails(page.query.id).then(function (order) {
        OrderDetailsController.order = order;
        var data = {
          id: order.id,
          status: {
            pending: order.status === 'pending',
            canceled: order.canceled,
            progress: order.status === 'paid' || order.status === 'processing',
            complete: order.status === 'complete'
          },
          date: parseInt(order.data.date, 10),
          service: {
            name: order.name,
            id: order.vendor_product_id
          },
          total: order.total,
          transaction: {
            card_name: order.wallet_transaction.card_name
          }
        };
        if (order.vendor_coupon_id) {
          data.coupon = {
            id: order.vendor_coupon_id,
            amount: order.discount
          };
        }
        OrderDetailsController.render(data);
      });
    }
  },
  render: function render(data) {
    tommy.tplManager.renderInline('nurse_booking__orderDetailsTemplate', data);
  },
  repeatOrder: function repeatOrder() {
    var order = OrderDetailsController.order;
    if (!order) return;

    _api2.default.cache.booking.date = parseInt(order.data.date, 10);
    _api2.default.cache.booking.location = order.data.location;
    delete _api2.default.cache.booking.coupon;

    _api2.default.getServiceDetails(order.vendor_product_id).then(function (service) {
      _api2.default.cache.booking.service = service;

      var confirmUrl = tommy.util.addonAssetUrl(Template7.global.currentAddonInstall.package, Template7.global.currentAddonInstall.version, 'views/order-confirm.html', true);
      tommy.f7.views.main.loadPage({ url: confirmUrl });
    });
  },
  payOrder: function payOrder() {
    // pay as usual
    var order = OrderDetailsController.order;
    (0, _payOrder3.default)({
      orderId: order.id,
      productName: order.name,
      productId: order.vendor_product_id,
      total: order.total,
      couponId: order.vendor_coupon_id,
      discount: order.discount,
      location: order.data.location,
      date: order.data.date
    }, false);
  },
  cancelOrder: function cancelOrder() {
    // cancel and move to cancel status page
  },
  uninit: function uninit() {
    OrderDetailsController.page = null;
    delete OrderDetailsController.page;
  }
};

exports.default = OrderDetailsController;

},{"../api":1,"../pay-order":13}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

var _couponPicker = require('../coupon-picker');

var _couponPicker2 = _interopRequireDefault(_couponPicker);

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
    var selectedCoupon = void 0;
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

    // Next Url
    var locationUrl = tommy.util.addonAssetUrl(Template7.global.currentAddonInstall.package, Template7.global.currentAddonInstall.version, 'views/location.html', true);

    // Template
    tommy.tplManager.renderTarget('nurse_booking__serviceDetailsTemplate', { service: service }, page.container);

    // Swiper
    f7.swiper($page.find('.swiper-container'), {
      pagination: '.swiper-pagination'
    });

    $$(page.container).on('click', '.service-details-coupons-link', function () {
      (0, _couponPicker2.default)(service.coupons, function (coupon) {
        selectedCoupon = coupon;
        _api2.default.cache.booking.service = service;
        _api2.default.cache.booking.coupon = selectedCoupon;
        f7.views.main.loadPage({ url: locationUrl });
      }, function () {
        selectedCoupon = undefined;
      });
    });

    $$(page.container).on('click', '.service-book-button', function () {
      _api2.default.cache.booking.service = service;

      if (service.coupons && service.coupons.length) {
        (0, _couponPicker2.default)(service.coupons, function (coupon) {
          selectedCoupon = coupon;
          _api2.default.cache.booking.service = service;
          _api2.default.cache.booking.coupon = selectedCoupon;
          f7.views.main.loadPage({ url: locationUrl });
        }, function () {
          _api2.default.cache.booking.coupon = null;
          delete _api2.default.cache.booking.coupon;
          selectedCoupon = undefined;
          f7.views.main.loadPage({ url: locationUrl });
        });
      } else {
        _api2.default.cache.booking.coupon = null;
        delete _api2.default.cache.booking.coupon;
        selectedCoupon = undefined;
        f7.views.main.loadPage({ url: locationUrl });
      }
    });
  },
  uninit: function uninit() {
    ServiceDetailsController.page = null;
    delete ServiceDetailsController.page;
  }
};

exports.default = ServiceDetailsController;

},{"../api":1,"../coupon-picker":10}],9:[function(require,module,exports){
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

},{"../api":1}],10:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (coupons, onConfirm, onSkip, selectedCoupon) {
  var f7 = window.tommy.app.f7;
  var currentCouponId = void 0;
  var currentCoupon = void 0;

  var renderCoupons = coupons.map(function (c) {
    return Object.assign({}, c, {
      checked: selectedCoupon ? c.id === selectedCoupon.id : false
    });
  });
  var html = tommy.tplManager.render('nurse_bookink__couponPickerTemplate', {
    coupons: renderCoupons
  });
  var modalEl = f7.modal({
    afterText: html,
    buttons: [{
      text: tommy.i18n.t('coupon_picker.skip_button', { defaultValue: 'Skip' }),
      onClick: function onClick() {
        if (onSkip) onSkip();
      }
    }, {
      text: tommy.i18n.t('coupon_picker.confirm_button', { defaultValue: 'Confirm' }),
      bold: true,
      onClick: function onClick() {
        if (onConfirm) onConfirm(currentCoupon);
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
      coupons.forEach(function (coupon) {
        if (coupon.id == parseInt(currentCouponId, 10)) {
          currentCoupon = coupon;
        }
      });
    }
  });
};

},{}],11:[function(require,module,exports){
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

},{}],12:[function(require,module,exports){
'use strict';

var _currencyMap = require('./currency-map');

var _currencyMap2 = _interopRequireDefault(_currencyMap);

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

var _orderConfirm = require('./controllers/order-confirm');

var _orderConfirm2 = _interopRequireDefault(_orderConfirm);

var _orderDetails = require('./controllers/order-details');

var _orderDetails2 = _interopRequireDefault(_orderDetails);

var _history = require('./controllers/history');

var _history2 = _interopRequireDefault(_history);

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

f7.onPageInit('nurse_booking__order-confirm', _orderConfirm2.default.init);
f7.onPageBeforeAnimation('nurse_booking__order-confirm', _orderConfirm2.default.onBeforeIn);
f7.onPageBeforeRemove('nurse_booking__order-confirm', _orderConfirm2.default.uninit);

f7.onPageInit('nurse_booking__order-details', _orderDetails2.default.init);
f7.onPageBeforeRemove('nurse_booking__order-details', _orderDetails2.default.uninit);

f7.onPageInit('nurse_booking__history', _history2.default.init);
f7.onPageBeforeRemove('nurse_booking__history', _history2.default.uninit);

t7.registerHelper('nurse_booking__currencySymbol', function (code) {
  return (0, _currencyMap2.default)(code);
});

},{"./controllers/date-time":2,"./controllers/history":3,"./controllers/index":4,"./controllers/location":5,"./controllers/order-confirm":6,"./controllers/order-details":7,"./controllers/service-details":8,"./controllers/service-list":9,"./currency-map":11}],13:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (data) {
  var createNewOrder = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
  var query = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : '';
  var productName = data.productName,
      productId = data.productId,
      total = data.total,
      _data$discount = data.discount,
      discount = _data$discount === undefined ? 0 : _data$discount,
      location = data.location,
      date = data.date,
      couponId = data.couponId,
      orderId = data.orderId;

  var f7 = tommy.app.f7;

  tommy.initWalletTransaction({
    addon: 'nurse_booking',
    payee_name: productName,
    currency: 'CNY',
    amount: total
  }, function (transaction) {
    var order = {
      vendor_product_id: productId,
      vendor_coupon_id: couponId || null,
      wallet_transaction_id: transaction.id,
      name: productName,
      status: 'paid',
      comment: '',
      data: {
        location: location,
        date: date
      },
      discount: discount,
      total: total
    };

    var successUrl = tommy.util.addonAssetUrl(Template7.global.currentAddonInstall.package, Template7.global.currentAddonInstall.version, 'views/order-success.html', true);
    if (createNewOrder) {
      _api2.default.sendOrder(order).then(function (response) {
        _api2.default.cache.booking.transaction = transaction;
        f7.views.main.loadPage({ url: successUrl + '&id=' + response.id });
      });
    } else {
      _api2.default.cache.booking.transaction = transaction;
      f7.views.main.loadPage({ url: successUrl + '&id=' + orderId });
    }
  }, function (transaction) {
    if (!transaction.id) return;
    var order = {
      vendor_product_id: productId,
      vendor_coupon_id: couponId || null,
      wallet_transaction_id: transaction.id,
      name: productName,
      status: 'pending',
      comment: '',
      data: {
        location: location,
        date: date
      },
      discount: discount,
      total: total
    };

    var errorUrl = tommy.util.addonAssetUrl(Template7.global.currentAddonInstall.package, Template7.global.currentAddonInstall.version, 'views/order-error.html', true);
    if (createNewOrder) {
      _api2.default.sendOrder(order).then(function (response) {
        _api2.default.cache.booking.transaction = transaction;
        f7.views.main.loadPage({ url: errorUrl + '&id=' + response.id });
      });
    } else {
      _api2.default.cache.booking.transaction = transaction;
      f7.views.main.loadPage({ url: errorUrl + '&id=' + orderId });
    }
  });
};

var _api = require('./api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var tommy = window.tommy;

},{"./api":1}]},{},[12]);
