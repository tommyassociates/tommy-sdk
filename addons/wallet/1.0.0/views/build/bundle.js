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
      window.tommy.tplManager.renderInline('wallet__walletsListTemplate', { items: items }, IndexController.page.container);
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
  return (item.status === 'paid' ? '-' : '+') + ' ' + item.amount;
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

},{"./controllers/card-details":2,"./controllers/index":3,"./controllers/settings":4,"./controllers/transaction-details":5,"./init-wallet-transaction":7}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (params, onSuccess, onError) {
  if (transaction.popup) return;
  transaction.init(params, onSuccess, onError);
};

var _api = require('./api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var tommy = window.tommy;
var transaction = {
  popup: null,
  params: null,
  showLoader: function showLoader() {
    if (transaction.$popup.find('.transaction-preloader').length) return;
    transaction.$popup.append('<div class="transaction-preloader"></div>');
  },
  hideLoader: function hideLoader() {
    transaction.$popup.find('.transaction-preloader').remove();
  },
  clear: function clear() {
    transaction.$popup.remove();
    transaction.popup = null;
    transaction.$popup = null;
    transaction.params = null;
    transaction.onSuccess = null;
    transaction.onError = null;
  },
  create: function create(data) {
    var card_name = data.card_name;

    transaction.showLoader();
    _api2.default.createWalletTransaction(data).then(function (response) {
      transaction.renderSuccess(Object.assign({}, response || {}, { card_name: card_name }));
      if (transaction.onSuccess) transaction.onSuccess();
    }).catch(function (error) {
      transaction.hideLoader();
      transaction.renderError(error);
      if (transaction.onError) transaction.onError();
    });
  },
  renderError: function renderError(error) {
    var $popup = transaction.$popup;

    var html = tommy.tplManager.render('wallet__transactionPopupStatus', {
      title: window.tommy.i18n.t('transaction_popup.error_title', { defaultValue: 'Fail' }),
      status: 'error',
      message: error.message || ''
    });
    transaction.$popup.html(html);
  },
  renderSuccess: function renderSuccess(data) {
    var $popup = transaction.$popup;
    var payee_name = data.payee_name,
        card_name = data.card_name,
        amount = data.amount;

    var html = tommy.tplManager.render('wallet__transactionPopupStatus', {
      title: window.tommy.i18n.t('transaction_popup.success_title', { defaultValue: 'Success' }),
      status: 'success',
      message: window.tommy.i18n.t('transaction_popup.success_message', {
        defaultValue: 'You sent ¥{{amount}}.<br>To {{to}}<br>From {{from}}',
        amount: amount,
        to: payee_name,
        from: card_name
      })
    });
    transaction.$popup.html(html);
  },
  render: function render() {
    var $popup = transaction.$popup,
        params = transaction.params;
    var addon_id = params.addon_id,
        addon_install_id = params.addon_install_id,
        payee_name = params.payee_name,
        amount = params.amount;


    transaction.showLoader();

    // get wallet cards
    _api2.default.getWalletCards().then(function (cards) {
      var _cards$ = cards[0],
          wallet_card_id = _cards$.id,
          wallet_account_id = _cards$.wallet_account_id,
          card_name = _cards$.name;


      var html = tommy.tplManager.render('wallet__transactionPopupDetails', {
        payee_name: payee_name,
        amount: amount,
        card_name: card_name
      });

      transaction.hideLoader();
      transaction.$popup.append(html);

      // send transaction
      function onConfirmClick(e) {
        e.preventDefault();
        $popup.find('.transaction-popup-confirm-button').off('click', onConfirmClick);

        transaction.create({
          addon_id: addon_id,
          addon_install_id: addon_install_id,
          payee_name: payee_name,
          amount: amount,
          wallet_card_id: wallet_card_id,
          wallet_account_id: wallet_account_id,
          card_name: card_name
        });
      }
      $popup.find('.transaction-popup-confirm-button').on('click', onConfirmClick);
    });
  },
  init: function init() {
    var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var onSuccess = arguments[1];
    var onError = arguments[2];
    var _tommy$app = tommy.app,
        f7 = _tommy$app.f7,
        t7 = _tommy$app.t7;

    transaction.params = params;
    transaction.onSuccess = onSuccess;
    transaction.onError = onError;

    var popup = f7.popup('\n      <div class="popup tablet-fullscreen wallet__transaction-popup"></div>\n    ');
    var $popup = $$(popup);

    transaction.popup = popup;
    transaction.$popup = $popup;

    $popup.on('popup:opened', function () {
      transaction.render();
    });
    $popup.on('popup:closed', function () {
      transaction.clear();
    });
  }
};

},{"./api":1}]},{},[6]);
