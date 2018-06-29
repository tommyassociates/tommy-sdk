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
  getSettings: function getSettings() {},
  saveSettings: function saveSettings() {},
  getOrderedLists: function getOrderedLists() {
    if (!API.cache['lists']) return [];
    var lists = Object.values(API.cache['lists']);
    if (!lists.length) return [];
    return lists.sort(function (a, b) {
      return a.data.position - b.data.position; // ascending order
    });
  },
  addTask: function addTask(item) {
    _index2.default.invalidateLists = true; // rerender lists
    API.cache['tasks'][item.id] = item;
    console.log('task added', item);
  },
  addTasks: function addTasks(items) {
    API.tasksLoaded = true;
    if (items && items.length) {
      for (var i = 0; i < items.length; i++) {
        if (Array.isArray(items[i])) API.addTasks(items[i]);else API.addTask(items[i]);
      }
    }
  },
  getListTasks: function getListTasks(listId) {
    var list = API.cache['lists'][listId];
    var tasks = [];
    for (var taskId in API.cache['tasks']) {
      var task = API.cache['tasks'][taskId];

      if (list.filters && task.filters) {
        (function () {

          // Filter on tags
          var taskTags = task.filters.map(function (x) {
            return x.name;
          });
          var listTags = list.filters.map(function (x) {
            return x.name;
          });
          var matchTags = taskTags.filter(function (x) {
            return listTags.indexOf(x) !== -1;
          });
          var matches = !!matchTags.length || !taskTags.length && !listTags.length;
          console.log('task matches list tags', task.name, task.filters, list.name, list.filters, matches);

          // Filter on status
          if (matches && list.data.statuses) {
            matches = list.data.statuses.indexOf(task.status) !== -1;
            console.log('task matches list statuses', task.name, task.status, list.name, list.statuses, matches);
          }

          if (matches) {
            tasks.push(task);
          }
        })();
      }
    }

    return tasks;
  },
  loadListTasks: function loadListTasks(list) {
    if (list._tasksLoaded) {
      console.log('tasks already loaded', list); // params
      return;
    }

    // Set the internal `_tasksLoaded` flag.
    // Tasks won't be reloaded until this is set to false
    list._tasksLoaded = true;

    // let name, tags, params, request, requests = []
    var name = window.tommy.config.getCurrentUserName();
    var tags = [name];
    if (list.data && list.filters) {
      for (var i = 0; i < list.filters.length; i++) {
        tags.push(list.filters[i].name);
      }
    }

    var params = {
      addon: 'tasks',
      kind: 'Task',
      tags: tags,
      include_filters: true,
      include_permission_to: true
    };

    if (list.data.statuses) params.status = list.data.statuses;

    return window.tommy.api.getFragments(params);
  },
  loadTasks: function loadTasks() {
    console.log('load tasks');

    var requests = [];
    for (var listId in API.cache['lists']) {
      var list = API.cache['lists'][listId];
      var request = API.loadListTasks(list);
      if (request) requests.push(request);
    }

    return Promise.all(requests).then(API.addTasks);
  },
  addTaskActivity: function addTaskActivity(task, type, text) {
    var currentUser = window.tommy.config.getCurrentUser();
    var activity = {
      type: type,
      text: text,
      time: new Date(),
      user_id: currentUser.id,
      user_name: currentUser.first_name
    };

    if (!task.data) {
      task.data = {};
    }
    if (!task.data.activity) {
      task.data.activity = [];
    }
    task.data.activity.unshift(activity);

    return activity;
  },
  saveTask: function saveTask(task) {
    console.log('save task', task);
    if (!task.name) {
      alert('Task name must be set');
      return;
    }

    _index2.default.invalidateLists = true; // rerender lists

    task.addon = 'tasks';
    task.kind = 'Task';
    task.include_filters = true;
    task.include_permission_to = true;
    if (!task.id) {
      API.addTaskActivity(task, 'status', window.tommy.i18n.t('task.created_a_task'));
    }
    if (!task.status) {
      task.status = API.STATUSES[0];
    }
    if (!task.start_at) {
      task.start_at = new Date().getTime();
    }

    // Specify the access permissions this resource will belong to
    if (!task.id) task.with_permissions = ['task_create_access', 'task_edit_access'];

    var params = Object.assign({}, task, { data: JSON.stringify(task.data) });
    if (task.id) {
      return window.tommy.api.updateFragment(task.id, params).then(API.addTask);
    } else {
      return window.tommy.api.createFragment(params).then(API.addTask);
    }
  },
  addList: function addList(item) {
    API.cache['lists'][item.id] = item;
    console.log('added task list', item);
  },
  addLists: function addLists(items) {
    API.listsLoaded = true;
    if (items && items.length) {
      for (var i = 0; i < items.length; i++) {
        API.addList(items[i]);
      }
    }
  },
  loadLists: function loadLists(params) {
    console.log('load task lists', params);

    params = Object.assign({
      addon: 'tasks',
      kind: 'TaskList',
      include_filters: true,
      include_permission_to: true
    }, params);
    return window.tommy.api.getFragments(params).then(API.addLists);
  },
  deleteList: function deleteList(listId) {
    _index2.default.invalidateLists = true;
    delete API.cache['lists'][listId];
    console.log('delete list', listId);
    return window.tommy.api.deleteFragment(listId);
  },
  saveList: function saveList(list) {
    console.log('save list', list);

    // Set the internal flags to reload tasks for this list
    API.tasksLoaded = false;
    list._tasksLoaded = false;
    _index2.default.invalidateLists = true; // rerender lists

    list.addon = 'tasks';
    list.kind = 'TaskList';
    list.include_filters = true;
    list.include_permission_to = true;
    if (!list.data) {
      list.data = {};
    }
    if (typeof list.data.position === 'undefined') {
      list.data.position = Object.keys(API.cache['lists']).length;
    }
    if (typeof list.data.active === 'undefined') {
      list.data.active = true;
    }
    if (typeof list.data.show_fast_add === 'undefined') {
      list.data.show_fast_add = true;
    }

    // Specify the access permissions this resource will belong to
    if (!list.id) list.with_permissions = ['task_list_read_access', 'task_list_edit_access'];

    var params = Object.assign({}, list, {
      data: JSON.stringify(list.data),
      filters: JSON.stringify(list.filters)
    });
    if (list.id) {
      return window.tommy.api.updateFragment(list.id, params).then(API.addList);
    } else {
      return window.tommy.api.createFragment(params).then(API.addList);
    }
  },
  currentUserTag: function currentUserTag() {
    return {
      context: 'members',
      name: window.tommy.config.getCurrentUserName(),
      user_id: window.tommy.config.getCurrentUserId()
    };
  },
  createDefaultList: function createDefaultList() {
    console.log('creating deafult task list');
    var list = {
      name: window.tommy.i18n.t('index.default-task-name'),
      data: {
        default: true
      },

      // Default list filters show tasks tagged with current user
      filters: [API.currentUserTag()]
    };
    return API.saveList(list);
  },
  hasDefaultList: function hasDefaultList() {
    return API.cache['lists'] && Object.values(API.cache['lists']).filter(function (x) {
      return x.data.default;
    }).length > 0;
  },


  // initPermissionSelects (page, wantedPermissions) {
  //   console.log('init permission selects', wantedPermissions)
  //   window.tommy.api.getInstalledAddonPermissions('tasks').then(permissions => {
  //     console.log('installed addon permissions', permissions)
  //     for (var i = 0; i < permissions.length; i++) {
  //       const wantedPermission = wantedPermissions.filter(x => x.name == permissions[i].name)[0]
  //       if (!wantedPermission) continue
  //       const permission = Object.assign({}, permissions[i], wantedPermission)
  //       console.log('init permissions', permission)
  //       window.tommy.tplManager.appendInline('tasks__tagSelectTemplate', permission, page.container)
  //       API.initTagSelect(page, permission)
  //     }
  //   })
  // },

  initPermissionSelect: function initPermissionSelect(page, name, resource_id) {
    console.log('init permission selects', name, resource_id);
    var params = {
      resource_id: resource_id,
      include_filters: true
    };
    window.tommy.api.getInstalledAddonPermission('tasks', name, params).then(function (permission) {
      console.log('installed addon permission', permission);
      // for (var i = 0; i < permissions.length; i++) {
      // const wantedPermission = wantedPermissions.filter(x => x.name == permissions[i].name)[0]
      // if (!wantedPermission) continue
      // const permission = Object.assign({}, permissions[i], wantedPermission)
      // console.log('init permissions', permission)
      permission.resource_id = resource_id;
      window.tommy.tplManager.appendInline('tasks__tagSelectTemplate', permission, page.container);
      API.initTagSelect(page, permission);
      // }
    });
  },
  initTagSelect: function initTagSelect(page, permission) {
    var $tagSelect = $$(page.container).find('.tag-select[data-permission-name="' + permission.name + '"]'); //.find('') //$page.find('#addon-permissions-form .tag-select')
    console.log('init tag select', permission, $tagSelect.dataset());
    window.tommy.tagSelect.initWidget($tagSelect, permission.filters, function (data) {
      console.log('save permission tags', permission, data);
      window.tommy.api.updateInstalledAddonPermission('tasks', permission.name, {
        resource_id: permission.resource_id, // pass the resource_id for resource specific permissions
        include_filters: true,
        filters: JSON.stringify(data) // data
      });
    });
  },
  isTablet: function isTablet() {
    return window.innerWidth >= 630;
  },


  STATUSES: ['Unassigned', 'Assigned', 'Processing', 'Completed', 'Closed', 'Archive Task', 'Cancel'],

  translateStatus: function translateStatus(status) {
    if (status) return window.tommy.i18n.t('status.' + window.tommy.util.underscore(status), { defaultValue: status });
  },
  untranslateStatus: function untranslateStatus(translatedStatus) {
    for (var i = 0; i < API.STATUSES.length; i++) {
      if (API.translateStatus(API.STATUSES[i]) === translatedStatus) return API.STATUSES[i];
    }
  },
  translatedStatuses: function translatedStatuses() {
    var statuses = [];
    for (var i = 0; i < API.STATUSES.length; i++) {
      statuses.push(API.translateStatus(API.STATUSES[i]));
    }
    return statuses;
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

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// == Router
window.tommy.app.f7.onPageInit('wallet__index', _index2.default.init);
window.tommy.app.f7.onPageBeforeRemove('wallet__index', _index2.default.uninit);

window.tommy.app.f7.onPageBeforeInit('wallet__card_details', _cardDetails2.default.init);
window.tommy.app.f7.onPageBeforeRemove('wallet__card_details', _cardDetails2.default.uninit);

window.tommy.app.f7.onPageInit('wallet__transaction_details', _transactionDetails2.default.init);
window.tommy.app.f7.onPageBeforeRemove('wallet__transaction_details', _transactionDetails2.default.uninit);

window.tommy.app.f7.onPageInit('wallet__settings', _settings2.default.init);
window.tommy.app.f7.onPageBeforeRemove('wallet__settings', _settings2.default.uninit);

// Helpers
window.tommy.app.t7.registerHelper('wallet__formatTransactionAmount', function (item) {
  return (item.status === 'paid' ? '-' : '+') + ' ' + item.amount_cents / 100;
});
window.tommy.app.t7.registerHelper('wallet__formatTransactionStatus', function (status) {
  return status[0].toUpperCase() + status.substr(1);
});
window.tommy.app.t7.registerHelper('wallet__formatTransactionDate', function (date) {
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

},{"./controllers/card-details":2,"./controllers/index":3,"./controllers/settings":4,"./controllers/transaction-details":5}]},{},[6]);
