(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _index = require('./controllers/index');

var _index2 = _interopRequireDefault(_index);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var API = {
  listsLoaded: false,
  transactionsLoaded: false,
  cache: {},

  initCache: function initCache() {
    API.cache = {
      lists: {},
      transactions: {}
    };
  },
  getOrderedLists: function getOrderedLists() {
    if (!API.cache['lists']) return [];
    var lists = Object.values(API.cache['lists']);
    if (!lists.length) return [];
    return lists.sort(function (a, b) {
      return a.data.position - b.data.position; // ascending order
    });
  },
  addTransaction: function addTransaction(item) {
    _index2.default.invalidateLists = true; // rerender lists
    API.cache['transactions'][item.id] = item;
    console.log('transaction added', item);
  },
  addTransactions: function addTransactions(items) {
    API.transactionsLoaded = true;
    if (items && items.length) {
      for (var i = 0; i < items.length; i++) {
        if (Array.isArray(items[i])) API.addTransactions(items[i]);else API.addTransaction(items[i]);
      }
    }
  },
  getListTransactions: function getListTransactions(listId) {
    var list = API.cache['lists'][listId];
    var transactions = [];
    for (var transactionId in API.cache['transactions']) {
      var transaction = API.cache['transactions'][transactionId];

      if (list.filters && transaction.filters) {
        (function () {

          // Filter on tags
          var transactionTags = transaction.filters.map(function (x) {
            return x.name;
          });
          var listTags = list.filters.map(function (x) {
            return x.name;
          });
          var matchTags = transactionTags.filter(function (x) {
            return listTags.indexOf(x) !== -1;
          });
          var matches = !!matchTags.length || !transactionTags.length && !listTags.length;
          console.log('transaction matches list tags', transaction.name, transaction.filters, list.name, list.filters, matches);

          // Filter on status
          if (matches && list.data.statuses) {
            matches = list.data.statuses.indexOf(transaction.status) !== -1;
            console.log('transaction matches list statuses', transaction.name, transaction.status, list.name, list.statuses, matches);
          }

          if (matches) {
            transactions.push(transaction);
          }
        })();
      }
    }

    return transactions;
  },
  loadListTransactions: function loadListTransactions(list) {
    if (list._transactionsLoaded) {
      console.log('transactions already loaded', list); // params
      return;
    }

    // Set the internal `_transactionsLoaded` flag.
    // Transactions won't be reloaded until this is set to false
    list._transactionsLoaded = true;

    // let name, tags, params, request, requests = []
    var name = window.tommy.config.getCurrentUserName();
    var tags = [name];
    if (list.data && list.filters) {
      for (var i = 0; i < list.filters.length; i++) {
        tags.push(list.filters[i].name);
      }
    }

    var params = {
      addon: 'accounts',
      kind: 'Transaction',
      tags: tags,
      with_filters: true,
      with_permission_to: true
    };
    if (list.data.date_range) {
      params.date_range = list.data.date_range;
    }
    if (list.data.statuses) params.status = list.data.statuses;

    return window.tommy.api.getFragments(params);
  },
  loadTransactions: function loadTransactions() {
    console.log('load transactions');

    var requests = [];
    for (var listId in API.cache['lists']) {
      var list = API.cache['lists'][listId];
      var request = API.loadListTransactions(list);
      if (request) requests.push(request);
    }

    return Promise.all(requests).then(API.addTransactions);
  },
  addTransactionActivity: function addTransactionActivity(transaction, type, text) {
    var currentUser = window.tommy.config.getCurrentUser();
    var activity = {
      type: type,
      text: text,
      time: new Date(),
      user_id: currentUser.id,
      user_name: currentUser.first_name
    };

    if (!transaction.data) {
      transaction.data = {};
    }
    if (!transaction.data.activity) {
      transaction.data.activity = [];
    }
    transaction.data.activity.unshift(activity);

    return activity;
  },
  saveTransaction: function saveTransaction(transaction) {
    console.log('save transaction', transaction);
    if (!transaction.name) {
      alert('Transaction name must be set');
      return;
    }

    _index2.default.invalidateLists = true; // rerender lists

    transaction.addon = 'transactions';
    transaction.kind = 'Transaction';
    transaction.with_filters = true;
    transaction.with_permission_to = true;
    if (!transaction.id) {
      API.addTransactionActivity(transaction, 'status', window.tommy.i18n.t('transaction.created_a_transaction'));
    }
    if (!transaction.status) {
      transaction.status = API.STATUSES[0];
    }
    if (!transaction.start_at) {
      transaction.start_at = new Date().getTime();
    }

    // Specify the access permissions this resource will belong to
    if (!transaction.id) {
      transaction.with_permissions = ['transaction_create_access', 'transaction_edit_access'];
      var actor = window.tommy.addons.getCurrentActor();
      if (actor) {
        if (!transaction.filters) transaction.filters = [];
        transaction.filters.push({
          context: 'members',
          name: actor.first_name + ' ' + actor.last_name,
          user_id: actor.user_id
        });
      }
    }

    var params = Object.assign({}, transaction, { data: JSON.stringify(transaction.data) });
    if (transaction.id) {
      return window.tommy.api.updateFragment(transaction.id, params).then(API.addTransaction);
    } else {
      return window.tommy.api.createFragment(params).then(API.addTransaction);
    }
  },
  addList: function addList(item) {
    API.cache['lists'][item.id] = item;
    console.log('added transaction list', item);
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
    console.log('load transaction lists', params);

    params = Object.assign({
      addon: 'accounts',
      kind: 'TransactionList',
      with_filters: true,
      with_permission_to: true
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

    // Set the internal flags to reload transactions for this list
    API.transactionsLoaded = false;
    list._transactionsLoaded = false;
    _index2.default.invalidateLists = true; // rerender lists

    list.addon = 'transactions';
    list.kind = 'TransactionList';
    list.with_filters = true;
    list.with_permission_to = true;
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
    if (!list.id) list.with_permissions = ['transaction_list_read_access', 'transaction_list_edit_access'];

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
    console.log('creating deafult transaction list');
    var list = {
      name: window.tommy.i18n.t('index.default-transaction-name'),
      data: {
        default: true
      },

      // Default list filters show transactions tagged with current user
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
  //   window.tommy.api.getInstalledAddonPermissions('transactions').then(permissions => {
  //     console.log('installed addon permissions', permissions)
  //     for (var i = 0; i < permissions.length; i++) {
  //       const wantedPermission = wantedPermissions.filter(x => x.name == permissions[i].name)[0]
  //       if (!wantedPermission) continue
  //       const permission = Object.assign({}, permissions[i], wantedPermission)
  //       console.log('init permissions', permission)
  //       window.tommy.tplManager.appendInline('accounts__tagSelectTemplate', permission, page.container)
  //       API.initTagSelect(page, permission)
  //     }
  //   })
  // },

  initPermissionSelect: function initPermissionSelect(page, name, resource_id) {
    console.log('init permission selects', name, resource_id);
    var params = {
      resource_id: resource_id,
      with_filters: true
    };
    window.tommy.api.getInstalledAddonPermission('transactions', name, params).then(function (permission) {
      console.log('installed addon permission', permission);
      // for (var i = 0; i < permissions.length; i++) {
      // const wantedPermission = wantedPermissions.filter(x => x.name == permissions[i].name)[0]
      // if (!wantedPermission) continue
      // const permission = Object.assign({}, permissions[i], wantedPermission)
      // console.log('init permissions', permission)
      permission.resource_id = resource_id;
      window.tommy.tplManager.appendInline('accounts__tagSelectTemplate', permission, page.container);
      API.initTagSelect(page, permission);
      // }
    });
  },
  initTagSelect: function initTagSelect(page, permission) {
    var $tagSelect = $$(page.container).find('.tag-select[data-permission-name="' + permission.name + '"]'); //.find('') //$page.find('#addon-permissions-form .tag-select')
    console.log('init tag select', permission, $tagSelect.dataset());
    window.tommy.tagSelect.initWidget($tagSelect, permission.filters, function (data) {
      console.log('save permission tags', permission, data);
      window.tommy.api.updateInstalledAddonPermission('transactions', permission.name, {
        resource_id: permission.resource_id, // pass the resource_id for resource specific permissions
        with_filters: true,
        filters: JSON.stringify(data) // data
      });
    });
  },
  isTablet: function isTablet() {
    return window.innerWidth >= 630;
  },


  STATUSES: ['Unassigned', 'Assigned', 'Processing', 'Completed', 'Closed', 'Archive Transaction', 'Cancel'],

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

var BoardSettingsController = {
  init: function init(page) {
    var $page = $$(page.container);
    var $nav = $$(page.navbarInnerContainer);

    window.tommy.tplManager.renderInline('accounts__boardSettingTemplate', null, $page);

    // Team manager only settings
    if (window.tommy.util.isTeamOwnerOrManager()) {
      _api2.default.initPermissionSelect(page, 'transaction_create_access');
      _api2.default.initPermissionSelect(page, 'transaction_edit_access');
    }

    // $nav.find('a.save').on('click', ev => {
    //   const data = window.tommy.app.f7.formToJSON($page.find('form'))
    //
    //   // NOTE: Form not implemented yet
    //   ev.preventDefault()
    // })
  }
};

exports.default = BoardSettingsController;

},{"../api":1}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

var _transaction = require('./transaction');

var _transaction2 = _interopRequireDefault(_transaction);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var IndexController = {
  init: function init(page) {
    console.log('initialize accounts addon');
    if (!_api2.default.listsLoaded) {
      // || !API.transactionsLoaded
      _api2.default.initCache();
      _api2.default.loadLists().then(function () {
        if (_api2.default.hasDefaultList()) {
          IndexController.loadTransactions(page);
        } else {

          // Create a default list if none exists
          _api2.default.createDefaultList().then(function () {
            IndexController.loadTransactions(page);
          });
        }
      });
    } else if (!_api2.default.transactionsLoaded) {
      IndexController.loadTransactions(page);
    } else {
      IndexController.invalidate(page);
    }

    IndexController.bind(page);
  },
  loadTransactions: function loadTransactions(page) {
    _api2.default.loadTransactions().then(function () {
      IndexController.invalidate(page);
    });
  },
  uninit: function uninit() {
    console.log('uninitialize accounts addon');
    _api2.default.cache = {};
  },
  bind: function bind(page) {
    var $page = $$(page.container);

    $page.find('.list-content').each(function () {
      var $el = $$(this);
      if ($el[0].scrollHeight >= $el[0].clientHeight) {
        $el.parent().addClass('hasScroll');
      }
    });

    $page.on('click', '.fast-add-toggle', function () {
      var $el = $$(this);
      var $panel = $el.closest('.in').removeClass('in').siblings().addClass('in');
      if ($el.data('input-focus')) {
        $panel.find('input').focus();
      }
    });

    $page.on('submit', 'form.fast-add-form', function (ev) {
      ev.preventDefault();
      var list = _api2.default.cache['lists'][$$(this).parents('[data-list-id]').data('list-id')];
      var data = window.tommy.app.f7.formToJSON(this);

      // Inherit list filters from list when quick adding transactions
      data.filters = list.filters;

      $$(this).find('input[name="name"]').val('');
      _api2.default.saveTransaction(data).then(function () {
        IndexController.invalidate(page);
      });
    });

    // Bind picker actions
    // KLUDGE: This is very hacky and will leave us with unbound events
    $$(document).on('picker:open', function (e) {
      var $this = $$(e.target);

      // Disable the current user from the participant picker,
      // they must always be selected
      if ($this.hasClass('tag-select-picker')) {
        var name = window.tommy.config.getCurrentUserName();
        $this.find('input[value="' + name + '"]').parent().parent().addClass('offscreen');
      }
    });

    $page.on('click', 'a.transaction-card', function () {
      var href = $$(this).data('href');

      // if (API.isTablet()) {
      $$.get(href, function (response) {
        var $popup = $$('<div class="popup" data-page="accounts__transaction" id="accounts__transactions"></div>');
        $popup.append(response);
        $popup.find('.back').removeClass('back');
        $popup.find('.page').addClass('navbar-fixed');
        window.tommy.f7.popup($popup);
        _transaction2.default.init({
          container: $popup.find('.page')[0],
          navbarInnerContainer: $popup.find('.navbar-inner')[0],
          query: $$.parseUrlQuery(href)
        });

        $popup.on('popup:close', function () {
          IndexController.invalidate(page);
        });

        // window.tommy.f7.initPage($popup.find('.page'))
      });
      // window.tommy.f7view.router.load({url: $$(this).data('href'), animatePages: false})
      // } else {
      //   window.tommy.f7view.router.loadPage($$(this).data('href'))
      // }
    });
  },
  invalidate: function invalidate(page) {
    // if (!IndexController.listsLoaded || !IndexController.transactionsLoaded) return;

    console.log('invalidating transactions index');
    var $page = $$(page.container);
    if (IndexController.invalidateLists || !$page.find('.card').length) {
      console.log('rendering transaction lists');
      IndexController.invalidateLists = false;
      window.tommy.tplManager.renderInline('accounts__listsTemplate', _api2.default.getOrderedLists(), page.container);

      var swiper = window.tommy.app.f7.swiper('.swiper-container', {
        centeredSlides: !_api2.default.isTablet(),
        spaceBetween: 0,
        freeMode: false,
        freeModeSticky: true,
        slidesPerView: 'auto'
      });
    }

    for (var listId in _api2.default.cache['lists']) {
      var $e = $$(page.container).find('[data-list-id="' + listId + '"] .list-content');
      var transactions = _api2.default.getListTransactions(listId);
      window.tommy.tplManager.renderTarget('accounts__listTransactionsTemplate', transactions, $e);
    }

    var actor = window.tommy.addons.getCurrentActor();
    if (actor) {
      window.tommy.app.setPageTitle(window.tommy.i18n.t('index.title_user', { user: actor.first_name }));
    }
  }
};

exports.default = IndexController;

},{"../api":1,"./transaction":8}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ListAddController = {
  init: function init(page) {
    var $page = $$(page.container);
    var $nav = $$(page.navbarInnerContainer);

    $nav.find('a.save').on('click', function (ev) {
      var data = window.tommy.app.f7.formToJSON($page.find('form'));
      ListAddController.saveList(data);
      ev.preventDefault();
    });
  },
  saveList: function saveList(data) {
    var list = {};
    list.name = data.name;

    // Default list filters show transactions tagged with current user
    list.filters = [_api2.default.currentUserTag()];

    // console.log('create list', list, data)
    // if (!list.name) {
    //   alert('List name must be set')
    //   return
    // }

    _api2.default.saveList(list).then(ListAddController.afterSave);
  },
  afterSave: function afterSave(res) {
    console.log('list saved', res);
    window.tommy.app.f7view.router.back();
  }
};

exports.default = ListAddController;

},{"../api":1}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

var _formatDateRange = require('../format-date-range');

var _formatDateRange2 = _interopRequireDefault(_formatDateRange);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ListEditController = {
  init: function init(page) {
    var list = _api2.default.cache['lists'][page.query.list_fragment_id];
    var $page = $$(page.container);
    var $nav = $$(page.navbarInnerContainer);

    console.log('edit list', list);

    // NOTE: we should probably check that the current user has
    // `transaction_list_edit_access` permission before rendering the page.

    window.tommy.tplManager.renderInline('accounts__listEditTemplate', list, $page);

    ListEditController.initListFilters(page, list);
    _api2.default.initPermissionSelect(page, 'transaction_list_read_access', list.id);
    _api2.default.initPermissionSelect(page, 'transaction_list_edit_access', list.id);

    $nav.find('a.save').on('click', function (ev) {
      var data = window.tommy.app.f7.formToJSON($page.find('form'));
      ListEditController.saveList(list, data);
      ev.preventDefault();
    });

    $page.find('.date-range-select').on('click', function (ev) {
      ListEditController.showDateRangePage(page, list);
      ev.preventDefault();
    });

    $page.find('select[name="statuses"]').on('change', function (ev) {
      list.data.statuses = $$(ev.target).val();
      console.log('update statuses', list.data.statuses);
    });

    $page.find('.delete-list').on('click', function (ev) {
      _api2.default.deleteList(list.id);
      window.tommy.app.f7view.router.back();
      ev.preventDefault();
    });
  },
  showDateRangePage: function showDateRangePage(settingsPage, list) {
    var html = window.tommy.tplManager.render('accounts__dateRangeSelectTemplate', list.data);

    function handleDateRangePage(page) {
      var $page = $$(page.container);
      var $nav = $$(page.navbarInnerContainer);
      var date_range = list.data.date_range;
      var range = date_range;
      var dateFrom = Array.isArray(range) && range[0] ? range : new Date().getTime();
      var dateTo = Array.isArray(range) && range[1] ? range : new Date().getTime();

      var $radios = $page.find('input[name="time_or_created_between"]');
      var $switch = $page.find('.label-switch input');

      function enableSave() {
        $nav.find('.toggle.save').addClass('active');
      }

      function save() {
        list.data.date_range = range;
        _api2.default.saveList(list).then(function (res) {
          $$(settingsPage.container).find('.date-range-select .item-after').text((0, _formatDateRange2.default)(range));
          ListEditController.afterSave(res);
        });
      }

      function onSwitchChange(e) {
        if (e.target.checked) {
          $page.find('.date-range-custom-item').show();
          $radios.prop('checked', false);
          range = [dateFrom, dateTo];
        } else {
          range = '';
          $page.find('.date-range-custom-item').hide();
        }
        enableSave();
      }
      function onRadioChange(e) {
        if (e.target.checked) {
          $switch.prop('checked', false).trigger('change');
          range = e.target.value;
        }
        enableSave();
      }

      if (typeof range === 'string' && range) {
        $page.find('input[name="time_or_created_between"][value="' + range + '"]').prop('checked', true);
        $page.find('.date-range-custom-item').hide();
      } else if (!range) {
        $page.find('input[name="time_or_created_between"][value=""]').prop('checked', true);
        $page.find('.date-range-custom-item').hide();
      } else if (Array.isArray(range)) {
        $switch.prop('checked', true);
      }
      var fromInitialChange = void 0;
      var toInitialChange = void 0;
      var calendarFrom = window.tommy.app.f7.calendar({
        input: $page.find('input[name="start_at"]'),
        closeOnSelect: true,
        value: [dateFrom],
        onChange: function onChange(c, values) {
          if (fromInitialChange) {
            enableSave();
          }
          fromInitialChange = true;
          dateFrom = new Date(values[0]).getTime();
          if (Array.isArray(range) && range[0]) range[0] = dateFrom;
          if (dateFrom > dateTo) {
            calendarTo.setValue([dateFrom]);
          }
        }
      });
      var calendarTo = window.tommy.app.f7.calendar({
        input: $page.find('input[name="end_at"]'),
        closeOnSelect: true,
        value: [dateTo],
        onChange: function onChange(c, values) {
          if (toInitialChange) {
            enableSave();
          }
          toInitialChange = true;
          dateTo = new Date(values[0]).getTime();
          if (Array.isArray(range) && range[1]) range[1] = dateTo;
          if (dateTo < dateFrom) {
            calendarFrom.setValue([dateTo]);
          }
        }
      });

      $switch.on('change', onSwitchChange);
      $radios.on('change', onRadioChange);
      $nav.find('.toggle.save').on('click', save);
    }

    $$(window.tommy.f7.views.main.container).once('page:init', '[data-page="accounts__date-range-select"]', function (e) {
      var page = e.detail.page;
      handleDateRangePage(page);
    });
    window.tommy.f7.views.main.loadContent(html);
  },
  initListFilters: function initListFilters(page, list) {
    // if (!list.filters)
    //     list.filters = []
    var object = {
      title: window.tommy.i18n.t('parmissions.filter_transactions.title'),
      name: 'filter_transactions'
    };
    var $tagSelect = window.tommy.tplManager.appendInline('accounts__tagSelectTemplate', object, page.container);
    console.log('init filter select', list.filters);
    window.tommy.tagSelect.initWidget($tagSelect, list.filters, function (data) {
      console.log('save filter tags', data);
      list.filters = data;
    });
  },
  saveList: function saveList(list, data) {
    list.name = data.name;
    list.data.show_fast_add = !!(data.show_fast_add && data.show_fast_add.length);

    _api2.default.saveList(list).then(ListEditController.afterSave);
  },
  afterSave: function afterSave(res) {
    console.log('list saved', res);
    window.tommy.app.f7view.router.back();
  }
};

exports.default = ListEditController;

},{"../api":1,"../format-date-range":9}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ListManagementController = {
  init: function init(page) {
    var $page = $$(page.container);
    var $nav = $$(page.navbarInnerContainer);

    ListManagementController.render(page);

    $nav.find('a.save').on('click', function (ev) {
      var data = window.tommy.app.f7.formToJSON($page.find('form'));
      ListManagementController.save(page, data);
      ev.preventDefault();
    });

    $page.on('change', 'input[type="checkbox"]', function () {
      $nav.find('a.save').addClass('active');
    });
  },
  render: function render(page) {
    var $page = $$(page.container);
    window.tommy.tplManager.renderInline('accounts__listManagementTemplate', _api2.default.getOrderedLists(), $page);
  },
  save: function save(page, data) {
    var $page = $$(page.container);
    var redirected = false;

    $page.find('.sortable [data-list-id]').each(function (index) {
      var $this = $$(this);
      var list = _api2.default.cache['lists'][$this.data('list-id')];
      var active = $this.find('input[type="checkbox"]')[0].checked;

      console.log('save list order', list.name, list.data.position, index, list.data.active, active);
      if (list.data.position != index || list.data.active != active) {
        list.data.position = index;
        list.data.active = active;
        _api2.default.saveList(list);
        console.log('updated list', list);

        if (!redirected) {
          redirected = true;
          window.tommy.app.f7view.router.back();
        }
      }
    });
  }
};

exports.default = ListManagementController;

},{"../api":1}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var TransactionAddController = {
  init: function init(page) {
    var $page = $$(page.container);
    var $nav = $$(page.navbarInnerContainer);

    window.tommy.tplManager.renderInline('accounts__addTransactionTemplate', {}, $page); // API.cache['lists']

    $nav.find('a.save').on('click', function (ev) {
      var data = window.tommy.app.f7.formToJSON($page.find('form'));
      data.filters = [_api2.default.currentUserTag()]; // tag the current user

      TransactionAddController.saveTransaction(data);
      ev.preventDefault();
    });
  },
  saveTransaction: function saveTransaction(data) {
    _api2.default.saveTransaction(data).then(TransactionAddController.afterSave);
  },
  afterSave: function afterSave(res) {
    console.log('transaction saved', res);
    window.tommy.app.f7view.router.back();
  }
};

exports.default = TransactionAddController;

},{"../api":1}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var TransactionController = {
  init: function init(page) {
    var transaction = _api2.default.cache['transactions'][page.query.transaction_fragment_id];
    var $page = $$(page.container);
    var $navbar = $$(page.navbarInnerContainer);

    var f7 = window.tommy.app.f7;

    console.log('init transaction details', transaction);
    window.tommy.tplManager.renderInline('accounts__transactionDetailsTemplate', transaction, $page.parent());

    $page.find('.transaction-menu-popover').on('popover:open', function () {
      // BUG: popover shows offscreen on desktop, this fixes it
      $$(window).trigger('resize');
    });

    $page.find('.transaction-menu-popover a').click(function (e) {
      var command = $$(e.target).data('command');

      switch (command) {
        case 'add-checklist':
          TransactionController.renderChecklist(page);
          break;
        case 'add-end-time':
          TransactionController.renderDeadline(page);
          break;
        default:
          alert('Unknown command: ' + command);
      }

      f7.closeModal('.transaction-menu-popover');
    });

    // Transaction title area
    // TODO: make into a reuasble module
    $page.find('.page-content').scroll(function (e) {
      if (e.target.scrollTop > 100) {
        $navbar.addClass('with-title');
      } else {
        $navbar.removeClass('with-title');
      }
    });

    // Transaction status picker
    TransactionController.initStatusPicker(page);

    // Transaction checklist actions
    if (transaction.data.checklist && transaction.data.checklist.items) {
      TransactionController.renderChecklist(page);
    }

    // Transaction deadline
    if (transaction.end_at) {
      TransactionController.renderDeadline(page);
    }

    // Transaction activity
    var myMessagebar = f7.messagebar('.messagebar', { maxHeight: 200 });
    myMessagebar.textarea.on('change input', function (e) {
      var value = myMessagebar.value().trim();
      if (value) myMessagebar.textarea.addClass('with-value');else myMessagebar.textarea.removeClass('with-value');
    });
    $page.find('.add-comment').click(function () {
      var value = myMessagebar.value().trim();
      if (!value) return;
      TransactionController.addActivity(page, 'comment', myMessagebar.value());
      myMessagebar.clear();
    });
    TransactionController.renderActivity(page);

    // Transaction participants
    var $tagSelect = $page.find('.tag-select');
    var participants = [];
    if (transaction.filters) {
      participants = transaction.filters;
    }
    console.log('init transaction participants', participants, $tagSelect.length);
    window.tommy.tplManager.renderInline('accounts__transactionParticipantsTemplate', participants, $page);
    window.tommy.tagSelect.initWidget($tagSelect, participants, function (data) {
      console.log('transaction participants changed', data);
      transaction.filters = data;
      window.tommy.tplManager.renderInline('accounts__transactionParticipantsTemplate', transaction.filters, page.container);
      TransactionController.saveTransaction(page);
    });

    // Transaction name inline editing
    var $editTransactionName = $page.find('textarea.edit-transaction-name');
    $editTransactionName.on('focus', function () {
      TransactionController.enableEditName(page, true);
    });
    f7.resizableTextarea('textarea.edit-transaction-name');
    f7.resizeTextarea('textarea.edit-transaction-name');

    // Transaction description inline editing
    var $editTransactionDescription = $page.find('textarea.edit-transaction-description');
    $editTransactionDescription.on('focus', function () {
      TransactionController.enableEditDescription(page, true);
    });
    f7.resizableTextarea('textarea.edit-transaction-description');
    f7.resizeTextarea('textarea.edit-transaction-description');

    // Save button
    $navbar.find('a.save').on('click', function () {
      TransactionController.saveTransaction(page);
      TransactionController.enableSave(page, false);
    });

    TransactionController.invalidate(page);
  },
  invalidate: function invalidate(page) {
    var transaction = _api2.default.cache['transactions'][page.query.transaction_fragment_id];

    // Page title must be set after animation
    // window.tommy.app.setPageTitle(transaction.name)
    var $navbar = $$(page.navbarInnerContainer);
    $navbar.find('.center').text(transaction.name);
  },
  renderActivity: function renderActivity(page) {
    var transaction = _api2.default.cache['transactions'][page.query.transaction_fragment_id];
    var $page = $$(page.container);

    var items = [];
    if (transaction.data.activity) {
      items = transaction.data.activity;
    }
    window.tommy.tplManager.renderInline('accounts__transactionActivityTemplate', items, $page);
  },
  addActivity: function addActivity(page, type, text) {
    var transaction = _api2.default.cache['transactions'][page.query.transaction_fragment_id];
    _api2.default.addTransactionActivity(transaction, type, text);

    TransactionController.renderActivity(page);
    TransactionController.saveTransaction(page);
  },
  renderChecklist: function renderChecklist(page) {
    var transaction = _api2.default.cache['transactions'][page.query.transaction_fragment_id];
    var $page = $$(page.container);

    var items = [];
    if (transaction.data.checklist && transaction.data.checklist.items) {
      items = transaction.data.checklist.items;
    }
    window.tommy.tplManager.renderInline('accounts__transactionChecklistTemplate', items, $page);

    var $input = $page.find('input.add-checklist-item');
    $input.on('blur', function () {
      var text = $$(this).val();
      transaction = _api2.default.cache['transactions'][page.query.transaction_fragment_id];
      if (!text || !text.length) {
        return;
      }

      if (!transaction.data.checklist) {
        transaction.data.checklist = {};
      }
      if (!transaction.data.checklist.items) {
        transaction.data.checklist.items = [];
      }
      transaction.data.checklist.items.push({
        text: text,
        complete: false
      });
      TransactionController.renderChecklist(page);
      TransactionController.saveTransaction(page);
    });
    $page.find('.remove-checklist').click(function () {
      transaction = _api2.default.cache['transactions'][page.query.transaction_fragment_id];
      // TODO: confirm alert
      transaction.data.checklist = {};
      $page.find('[data-template="accounts__transactionChecklistTemplate"]').html('');
      TransactionController.saveTransaction(page);
    });
    $page.find('.remove-checklist-item').click(function () {
      transaction = _api2.default.cache['transactions'][page.query.transaction_fragment_id];
      var index = parseInt($$(this).parents('li').data('checklist-item'));

      console.log('removing checklist item', index);
      transaction.data.checklist.items.splice(index, 1);
      TransactionController.renderChecklist(page);

      TransactionController.saveTransaction(page);
    });
    $page.find('.checklist-item').click(function (e) {
      var $target = $$(e.target);
      if ($target.hasClass('remove-checklist-item') || $target.parents('.remove-checklist-item').length) {
        return;
      }
      var index = parseInt($$(this).parents('li').data('checklist-item'));
      var isChecked = $$(this).hasClass('checked');
      transaction = _api2.default.cache['transactions'][page.query.transaction_fragment_id];
      console.log('toggle checklist item', index);
      if (isChecked) {
        $$(this).removeClass('checked');
        transaction.data.checklist.items[index].complete = false;
      } else {
        $$(this).addClass('checked');
        transaction.data.checklist.items[index].complete = true;
      }

      TransactionController.saveTransaction(page);
    });
  },
  renderDeadline: function renderDeadline(page) {
    var transaction = _api2.default.cache['transactions'][page.query.transaction_fragment_id];
    var $page = $$(page.container);

    console.log('render deadline', transaction.end_at);
    window.tommy.tplManager.renderInline('accounts__transactionDeadlineTemplate', transaction.end_at, $page);

    var $input = $page.find('input.edit-transaction-deadline');
    var format = 'dddd, MMM Do YY, h:mm a';
    var picker = window.tommy.util.createDatePicker($input, transaction.end_at, {
      onClose: function onClose() {
        console.log('closing deadline picker', picker.currentDate);
        transaction.end_at = new Date(picker.currentDate).toJSON();

        TransactionController.saveTransaction(page);
      },
      onFormat: function onFormat(date) {
        console.log('format deadline picker', date);
        return window.tommy.util.humanTime(date);
      }
    });

    if (!transaction.end_at) {
      $input.val('');
    }

    $page.on('click', '.remove-deadline', function () {
      // TODO: confirm alert
      delete transaction.end_at;
      $page.find('[data-template="accounts__transactionDeadlineTemplate"]').html('');
      TransactionController.saveTransaction(page);
    });
  },
  initStatusPicker: function initStatusPicker(page) {
    var transaction = _api2.default.cache['transactions'][page.query.transaction_fragment_id];
    var initial = transaction.status === 'Unassigned' ? window.tommy.i18n.t('transaction.waiting_for_assignments') : _api2.default.translateStatus(transaction.status);

    return window.tommy.app.f7.picker({
      input: $$(page.container).find('.transaction-status-picker'),
      value: [initial],
      convertToPopover: false,
      cols: [{
        textAlign: 'center',
        values: _api2.default.translatedStatuses()
      }],
      onClose: function onClose(p) {
        var translatedStatus = p.value[0];
        var status = _api2.default.untranslateStatus(p.value[0]);
        if (status == transaction.status) {
          return;
        }
        transaction.status = status;
        TransactionController.addActivity(page, 'status', window.tommy.i18n.t('transaction.changed_status_to', { status: translatedStatus }));
        TransactionController.saveTransaction(page);
      }
    });
  },
  saveTransaction: function saveTransaction(page) {
    var transaction = _api2.default.cache['transactions'][page.query.transaction_fragment_id];

    console.log('saving transaction fragment', transaction);
    _api2.default.saveTransaction(transaction);
  },
  enableEditName: function enableEditName(page, flag) {
    var transaction = _api2.default.cache['transactions'][page.query.transaction_fragment_id];
    var $page = $$(page.container);
    var $textarea = $page.find('textarea.edit-transaction-name');

    if (flag != false) {
      $textarea.once('focusout', function () {
        var newValue = $textarea.val();
        if (transaction.name !== newValue) {
          transaction.name = newValue;
          TransactionController.saveTransaction(page);
          console.log('set transaction name', transaction.name);
        }
      });
    }
  },
  enableEditDescription: function enableEditDescription(page, flag) {
    var transaction = _api2.default.cache['transactions'][page.query.transaction_fragment_id];
    var $page = $$(page.container);
    var $textarea = $page.find('textarea.edit-transaction-description');

    if (flag != false) {
      $textarea.once('focusout', function () {
        var newValue = $textarea.val();
        if (transaction.data.description !== newValue) {
          transaction.data.description = newValue;
          TransactionController.saveTransaction(page);
          console.log('set transaction description', transaction.data.description);
        }
      });
    }
  },
  enableSave: function enableSave(page, flag) {
    var $navbar = $$(page.navbarInnerContainer);
    var $save = $navbar.find('a.save');

    if (flag != false) {
      $save.siblings().hide();
      $save.css('display', 'flex'); // show()
    } else {
      $save.siblings().css('display', 'flex'); // .css('display: flex') // show()
      $save.hide();
    }
  }
};

exports.default = TransactionController;

},{"../api":1}],9:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (range) {
  if (!range) return '';
  if (typeof range === 'string') {
    return window.tommy.i18n.t('date_range.' + range);
  }
  if (Array.isArray(range)) {
    return formatDate(range[0]) + ' - ' + formatDate(range[1]);
  }
  return range || '';
};

function formatDate(date) {
  var d = new Date();
  var year = d.getFullYear();
  var month = d.getMonth() + 1;
  var day = d.getDate();
  if (month < 10) month = '0' + month;
  if (day < 10) day = '0' + day;
  return year + '-' + month + '-' + day;
}

},{}],10:[function(require,module,exports){
'use strict';

var _api = require('./api');

var _api2 = _interopRequireDefault(_api);

var _index = require('./controllers/index');

var _index2 = _interopRequireDefault(_index);

var _transaction = require('./controllers/transaction');

var _transaction2 = _interopRequireDefault(_transaction);

var _transactionAdd = require('./controllers/transaction-add');

var _transactionAdd2 = _interopRequireDefault(_transactionAdd);

var _listAdd = require('./controllers/list-add');

var _listAdd2 = _interopRequireDefault(_listAdd);

var _listEdit = require('./controllers/list-edit');

var _listEdit2 = _interopRequireDefault(_listEdit);

var _listManagement = require('./controllers/list-management');

var _listManagement2 = _interopRequireDefault(_listManagement);

var _boardSettings = require('./controllers/board-settings');

var _boardSettings2 = _interopRequireDefault(_boardSettings);

var _formatDateRange = require('./format-date-range');

var _formatDateRange2 = _interopRequireDefault(_formatDateRange);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

//
// == Router

window.tommy.app.f7.onPageInit('accounts__index', _index2.default.init);
window.tommy.app.f7.onPageBack('accounts__index', _index2.default.uninit);
window.tommy.app.f7.onPageAfterAnimation('accounts__index', _index2.default.invalidate);
window.tommy.app.f7.onPageInit('accounts__board-settings', _boardSettings2.default.init);
window.tommy.app.f7.onPageInit('accounts__list-add', _listAdd2.default.init);
window.tommy.app.f7.onPageInit('accounts__list-edit', _listEdit2.default.init);
window.tommy.app.f7.onPageInit('accounts__list-management', _listManagement2.default.init);
window.tommy.app.f7.onPageAfterAnimation('accounts__list-management', _listManagement2.default.render);
window.tommy.app.f7.onPageInit('accounts__transaction-add', _transactionAdd2.default.init);
window.tommy.app.f7.onPageInit('accounts__transaction', _transaction2.default.init);
window.tommy.app.f7.onPageAfterAnimation('accounts__transaction', _transaction2.default.invalidate);

//
// == Template7 Helpers

window.tommy.app.t7.registerHelper('accounts__checklistNumCompleted', function (checklist) {
  var ret = '';
  if (checklist && checklist.items) {
    var completed = checklist.items.filter(function (value) {
      return value.complete;
    });
    ret += completed.length;
    ret += '/';
    ret += checklist.items.length;
  }
  return ret;
});

window.tommy.app.t7.registerHelper('accounts__displayStatus', function (status) {
  return _api2.default.translateStatus(status);
});

window.tommy.app.t7.registerHelper('accounts__displayStatuses', function (statuses) {
  if (statuses) {
    return statuses.map(function (x) {
      return _api2.default.translateStatus(x);
    }).join(', ');
  } else {
    return '';
  }
});

window.tommy.app.t7.registerHelper('accounts__statusSelectOptions', function (statuses) {
  var ret = '';
  for (var i = 0; i < _api2.default.STATUSES.length; i++) {
    var status = _api2.default.STATUSES[i];
    var selected = statuses && statuses.indexOf(status) !== -1;
    ret += '<option value="' + status + '" ' + (selected ? 'selected' : '') + '>' + _api2.default.translateStatus(status) + '</option>';
  }
  return ret;
});

window.tommy.app.t7.registerHelper('accounts__ifCanEditList', function (list, options) {
  var account = window.tommy.config.getCurrentAccount();

  // BUG: Due to some unknown bug `this` is undefined in this function,
  // so substituting with the `list` variable for return variables
  // console.log('accounts__canEditList', this, list, options)

  // Default lists (the list automatically created for each team member) can
  // only be edited by admins
  if (list.data.default && !window.tommy.util.isTeamOwnerOrManager(account)) return options.inverse(list, options.data);

  if (list.permission_to.indexOf('update') !== -1) return options.fn(list, options.data);else return options.inverse(list, options.data);
});

window.tommy.app.t7.registerHelper('accounts__displayDateRange', function (range) {
  return (0, _formatDateRange2.default)(range);
});

},{"./api":1,"./controllers/board-settings":2,"./controllers/index":3,"./controllers/list-add":4,"./controllers/list-edit":5,"./controllers/list-management":6,"./controllers/transaction":8,"./controllers/transaction-add":7,"./format-date-range":9}]},{},[10]);
