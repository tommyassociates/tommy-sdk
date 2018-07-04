(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _index = require('./controllers/index');

var _index2 = _interopRequireDefault(_index);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var api = window.tommy.api;
var API = {
  wallet: {},
  getWallet: function getWallet() {
    return api.call({
      endpoint: 'wallet',
      method: 'GET',
      data: {}
    }).then(function (data) {
      API.wallet = data;
      return data;
    });
  },
  updateWalletSettings: function updateWalletSettings() {
    var data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    Object.keys(data).forEach(function (key) {
      API.wallet[key] = data[key];
    });
    return api.call({
      endpoint: 'wallet',
      method: 'PUT',
      data: data
    });
  },
  getWalletCards: function getWalletCards() {
    return api.call({
      endpoint: 'wallet/cards',
      method: 'GET',
      data: {}
    });
  },
  getWalletTransactions: function getWalletTransactions(cardId) {
    return api.call({
      endpoint: 'wallet/transactions',
      method: 'GET',
      data: {
        card_id: cardId
      }
    });
  },
  getWalletTransaction: function getWalletTransaction(transactionId) {
    return api.call({
      endpoint: 'wallet/transactions/' + transactionId,
      method: 'GET',
      data: {}
    });
  },
  getBalanceHistory: function getBalanceHistory() {},
  createWalletTransaction: function createWalletTransaction() {
    var data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    return api.call({
      endpoint: 'wallet/transactions',
      method: 'POST',
      data: data
    });
  }
};

exports.default = API;

},{"./controllers/index":3}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var CardDetailsController = {
  init: function init(page) {
    var _page$query = page.query,
        id = _page$query.id,
        name = _page$query.name;

    if (name) {
      $$(page.navbarInnerContainer).find('.center').text(name);
    }
    _api2.default.getWalletTransactions(id).then(function (data) {
      window.tommy.tplManager.renderInline('wallet__transactionsListTemplate', { items: data }, page.container);
    });
  },
  uninit: function uninit() {}
};

exports.default = CardDetailsController;

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
    console.log('initialize wallet addon');
    IndexController.bind(page);
    IndexController.loadWalletInfo();
    IndexController.loadWallets();
    IndexController.loadTransactions();
    IndexController.loadBalanceHistory();
  },
  loadWalletInfo: function loadWalletInfo() {
    _api2.default.getWallet().then(function (data) {
      if (data.show_balance) {
        $$(IndexController.page.container).find('.wallet-balance-value').text(data.balance);
      }
    });
  },
  loadWallets: function loadWallets() {
    _api2.default.getWalletCards().then(function (items) {
      var showTestButton = window.localStorage.env === 'development';
      window.tommy.tplManager.renderInline('wallet__walletsListTemplate', {
        items: items,
        showTestButton: showTestButton
      }, IndexController.page.container);
      if (showTestButton) {
        $$('#wallet__createTestTransaction').on('click', function () {
          window.tommy.initWalletTransaction({
            addon_id: 26,
            addon_install_id: 8430,
            payee_name: 'Apple / iMac Pro',
            currency: 'CNY',
            amount: 100
          });
        });
        $$('#wallet__createTestErrorTransaction').on('click', function () {
          window.tommy.initWalletTransaction({
            addon_id: 26,
            addon_install_id: 8430,
            payee_name: 'Mercedes S600',
            currency: 'USD',
            amount: 100000
          });
        });
      }
    });
  },
  loadTransactions: function loadTransactions() {
    _api2.default.getWalletTransactions().then(function (items) {
      window.tommy.tplManager.renderInline('wallet__transactionsListTemplate', { items: items }, IndexController.page.container);
    });
  },
  loadBalanceHistory: function loadBalanceHistory() {},
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

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var SettingsController = {
  init: function init(page) {
    var _API$wallet = _api2.default.wallet,
        enable_notifications = _API$wallet.enable_notifications,
        show_balance = _API$wallet.show_balance;

    SettingsController.bind(page);

    var data = { enable_notifications: enable_notifications, show_balance: show_balance };
    window.tommy.tplManager.renderInline('wallet__settingsTemplate', data, page.container);
  },
  onInputChange: function onInputChange(e) {
    var _e$target = e.target,
        name = _e$target.name,
        checked = _e$target.checked;

    _api2.default.updateWalletSettings(_defineProperty({}, name, checked)).then(function () {
      if (name !== 'show_balance') return;
      if (_api2.default.wallet.show_balance) {
        $$('.wallet-balance-value').text(_api2.default.wallet.balance);
      } else {
        $$('.wallet-balance-value').text('');
      }
    });
  },
  bind: function bind(page) {
    SettingsController.page = page;
    var $page = $$(page.container);
    $page.on('change', 'input', SettingsController.onInputChange);
  },
  uninit: function uninit() {
    if (!SettingsController.page) return;
    var $page = $$(SettingsController.page.container);
    $page.off('change', 'input', SettingsController.onInputChange);
    SettingsController.page = null;
    delete SettingsController.page;
  }
};

exports.default = SettingsController;

},{"../api":1}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var TransactionDetailsController = {
  init: function init(page) {
    var id = page.query.id;

    _api2.default.getWalletTransaction(id).then(function (data) {
      window.tommy.tplManager.renderInline('wallet__transactionDetailsTemplate', data, page.container);
    });
  },
  uninit: function uninit() {}
};

exports.default = TransactionDetailsController;

},{"../api":1}],6:[function(require,module,exports){
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

var _index = require('./controllers/index');

var _index2 = _interopRequireDefault(_index);

var _cardDetails = require('./controllers/card-details');

var _cardDetails2 = _interopRequireDefault(_cardDetails);

var _transactionDetails = require('./controllers/transaction-details');

var _transactionDetails2 = _interopRequireDefault(_transactionDetails);

var _settings = require('./controllers/settings');

var _settings2 = _interopRequireDefault(_settings);

var _initWalletTransaction = require('./init-wallet-transaction');

var _initWalletTransaction2 = _interopRequireDefault(_initWalletTransaction);

var _currencyMap = require('./currency-map');

var _currencyMap2 = _interopRequireDefault(_currencyMap);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _window$tommy$app = window.tommy.app,
    f7 = _window$tommy$app.f7,
    t7 = _window$tommy$app.t7;

// == Router

f7.onPageInit('wallet__index', _index2.default.init);
f7.onPageBeforeRemove('wallet__index', _index2.default.uninit);

f7.onPageBeforeInit('wallet__card_details', _cardDetails2.default.init);
f7.onPageBeforeRemove('wallet__card_details', _cardDetails2.default.uninit);

f7.onPageInit('wallet__transaction_details', _transactionDetails2.default.init);
f7.onPageBeforeRemove('wallet__transaction_details', _transactionDetails2.default.uninit);

f7.onPageInit('wallet__settings', _settings2.default.init);
f7.onPageBeforeRemove('wallet__settings', _settings2.default.uninit);

// Helpers
t7.registerHelper('wallet__formatTransactionAmount', function (item) {
  return (item.status === 'paid' || item.status === 'failed' ? '-' : '+') + ' ' + (0, _currencyMap2.default)(item.currency) + item.amount;
});
t7.registerHelper('wallet__currencySymbol', function (code) {
  return (0, _currencyMap2.default)(code);
});
t7.registerHelper('wallet__formatTransactionStatus', function (status) {
  return status[0].toUpperCase() + status.substr(1);
});
t7.registerHelper('wallet__formatTransactionDate', function (date) {
  if (!date) return '';
  var d = new Date(date);
  var year = d.getFullYear();

  var month = d.getMonth() + 1;
  if (month < 10) month = '0' + month;

  var day = d.getDate();
  if (day < 10) day = '0' + day;

  var hours = d.getHours();
  if (hours < 10) hours = '0' + hours;

  var minutes = d.getMinutes();
  if (minutes < 10) minutes = '0' + minutes;

  return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes;
});

// Pay Popup
window.tommy.initWalletTransaction = _initWalletTransaction2.default;

},{"./controllers/card-details":2,"./controllers/index":3,"./controllers/settings":4,"./controllers/transaction-details":5,"./currency-map":6,"./init-wallet-transaction":8}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (params, onSuccess, onError) {
  if (transaction.cache.popup) return;
  transaction.init(params, onSuccess, onError);
};

var _currencyMap = require('./currency-map');

var _currencyMap2 = _interopRequireDefault(_currencyMap);

var _api = require('./api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var tommy = window.tommy;
var transaction = {
  cache: {
    popup: null,
    params: null
  },
  selectWallet: function selectWallet(cards, callback) {
    var f7 = tommy.app.f7;

    var walletButtons = cards.map(function (card) {
      return {
        text: card.name,
        onClick: function onClick() {
          if (callback) callback(card);
        }
      };
    });
    f7.actions(walletButtons);
  },
  showLoader: function showLoader() {
    if (transaction.cache.$popup.find('.transaction-preloader').length) return;
    transaction.cache.$popup.append('<div class="transaction-preloader"></div>');
  },
  hideLoader: function hideLoader() {
    transaction.cache.$popup.find('.transaction-preloader').remove();
  },
  clear: function clear() {
    transaction.cache.$popup.remove();
    transaction.cache = {};
  },
  renderError: function renderError(error) {
    var $popup = transaction.cache.$popup;

    var message = typeof error === 'string' ? message : error && error.message || '';
    var html = tommy.tplManager.render('wallet__transactionPopupStatus', {
      title: tommy.i18n.t('transaction_popup.error_title', { defaultValue: 'Fail' }),
      status: 'error',
      message: message
    });
    transaction.cache.onReportBack = function () {
      return $popup.html(html);
    };
    $popup.html(html);
  },
  renderSuccess: function renderSuccess(data) {
    var $popup = transaction.cache.$popup;
    var payee_name = data.payee_name,
        card_name = data.card_name,
        amount = data.amount,
        currency = data.currency;

    var html = tommy.tplManager.render('wallet__transactionPopupStatus', {
      title: tommy.i18n.t('transaction_popup.success_title', { defaultValue: 'Success' }),
      status: 'success',
      message: tommy.i18n.t('transaction_popup.success_message', {
        defaultValue: 'You sent {{amount}}{{amount}}.<br>To {{to}}<br>From {{from}}',
        currency: (0, _currencyMap2.default)(currency),
        amount: amount,
        to: payee_name,
        from: card_name
      })
    });
    transaction.cache.onReportBack = function () {
      return $popup.html(html);
    };
    $popup.html(html);
  },
  createTransaction: function createTransaction(data) {
    var card_name = data.card_name;

    transaction.showLoader();
    _api2.default.createWalletTransaction(data).then(function (response) {
      transaction.hideLoader();
      var transactionDetails = Object.assign({}, response || {}, { card_name: card_name });
      transaction.cache.transactionDetails = transactionDetails;

      if (transactionDetails.status && transactionDetails.status !== 'failed') {
        transaction.renderSuccess(transactionDetails);
        if (transaction.cache.onSuccess) transaction.cache.onSuccess();
      } else if (transactionDetails.status === 'failed') {
        transaction.renderError(Object.assign(transactionDetails, {
          message: tommy.i18n.t('transaction_popup.error_insufficient', { defaultValue: 'Sorry. Your Tommy account balance is insufficient. Please use other payment methods' })
        }));
        if (transaction.cache.onError) transaction.cache.onError();
      }
    }).catch(function (error) {
      var transactionDetails = Object.assign({}, data, { status: 'failed' });
      transaction.hideLoader();
      transaction.cache.transactionDetails = transactionDetails;
      transaction.renderError(error);
      if (transaction.cache.onError) transaction.cache.onError();
    });
  },
  viewReport: function viewReport() {
    var f7 = tommy.app.f7;
    var _transaction$cache = transaction.cache,
        $popup = _transaction$cache.$popup,
        transactionDetails = _transaction$cache.transactionDetails;

    var html = '\n      <div class="page navbar-fixed">\n        <div class="navbar no-border">\n          <div class="navbar-inner">\n            <div class="left">\n              <a href="#" class="link icon-only transaction-popup-report-back"><i class="icon f7-icons">chevron_left</i></a>\n            </div>\n            <div class="center">' + tommy.i18n.t('transaction_details.title', { defaultValue: 'Transaction Details' }) + '</div>\n            <div class="right">\n              <a href="#" class="link icon-only close-popup" data-popup=".wallet__transaction-popup">\n                <i class="icon f7-icons">close</i>\n              </a>\n            </div>\n          </div>\n        </div>\n        <div class="page-content transaction-popup-fade-in">\n         ' + tommy.tplManager.render('wallet__transactionDetailsTemplate', transactionDetails) + '\n        </div>\n      </div>\n    ';
    $popup.html(html);
    f7.sizeNavbars($popup);
  },
  render: function render() {
    var f7 = tommy.app.f7;
    var _transaction$cache2 = transaction.cache,
        $popup = _transaction$cache2.$popup,
        params = _transaction$cache2.params;
    var addon_id = params.addon_id,
        addon_install_id = params.addon_install_id,
        payee_name = params.payee_name,
        amount = params.amount,
        currency = params.currency;


    transaction.showLoader();

    // get wallet cards
    _api2.default.getWalletCards().then(function (cards) {
      var multiple = cards.length > 1;
      var _cards$ = cards[0],
          wallet_card_id = _cards$.id,
          wallet_account_id = _cards$.wallet_account_id,
          card_name = _cards$.name;

      var html = tommy.tplManager.render('wallet__transactionPopupDetails', {
        payee_name: payee_name,
        currency: (0, _currencyMap2.default)(currency),
        amount: amount,
        card_name: card_name,
        multiple: multiple
      });

      transaction.hideLoader();
      $popup.append(html);

      $popup.on('click', '.transaction-popup-select-wallet', function () {
        if (!multiple) return;
        transaction.selectWallet(cards, function (card) {
          card_name = card.name;
          wallet_card_id = card.id;
          wallet_account_id = card.wallet_account_id;
          $popup.find('.transaction-popup-select-wallet').text(card_name);
        });
      });
      $popup.once('click', '.transaction-popup-confirm-button', function () {
        transaction.createTransaction({
          addon_id: addon_id,
          addon_install_id: addon_install_id,
          payee_name: payee_name,
          currency: currency,
          amount: amount,
          wallet_card_id: wallet_card_id,
          wallet_account_id: wallet_account_id,
          card_name: card_name
        });
      });
      $popup.on('click', '.transaction-popup-report-button', function () {
        $popup.addClass('transaction-popup-status-rendered');
        transaction.viewReport();
      });
      $popup.on('click', '.transaction-popup-report-back', function () {
        if (transaction.cache.onReportBack) transaction.cache.onReportBack();
      });
    }).catch(function (error) {
      f7.closeModal('.wallet__transaction-popup');
    });
  },
  init: function init() {
    var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var onSuccess = arguments[1];
    var onError = arguments[2];
    var f7 = tommy.app.f7;

    transaction.cache.params = params;
    transaction.cache.onSuccess = onSuccess;
    transaction.cache.onError = onError;

    var popup = f7.popup('\n      <div class="popup tablet-fullscreen wallet__transaction-popup"></div>\n    ');
    var $popup = $$(popup);

    transaction.cache.popup = popup;
    transaction.cache.$popup = $popup;

    $popup.on('popup:opened', function () {
      transaction.render();
    });
    $popup.on('popup:closed', function () {
      transaction.clear();
    });
  }
};

},{"./api":1,"./currency-map":6}]},{},[7]);
