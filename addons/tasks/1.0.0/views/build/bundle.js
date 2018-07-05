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
  tasksLoaded: false,
  cache: {},

  initCache: function initCache() {
    API.cache = {
      lists: {},
      tasks: {}
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
      with_filters: true,
      with_permission_to: true
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
    task.with_filters = true;
    task.with_permission_to = true;
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

    // Set the internal flags to reload tasks for this list
    API.tasksLoaded = false;
    list._tasksLoaded = false;
    _index2.default.invalidateLists = true; // rerender lists

    list.addon = 'tasks';
    list.kind = 'TaskList';
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
      with_filters: true
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
        with_filters: true,
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

var BoardSettingsController = {
  init: function init(page) {
    var $page = $$(page.container);
    var $nav = $$(page.navbarInnerContainer);

    window.tommy.tplManager.renderInline('tasks__boardSettingTemplate', null, $page);

    // Team manager only settings
    if (window.tommy.util.isTeamOwnerOrManager()) {
      _api2.default.initPermissionSelect(page, 'task_create_access');
      _api2.default.initPermissionSelect(page, 'task_edit_access');
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

var _task = require('./task');

var _task2 = _interopRequireDefault(_task);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var IndexController = {
  init: function init(page) {
    console.log('initialize tasks addon');
    if (!_api2.default.listsLoaded) {
      // || !API.tasksLoaded 
      _api2.default.initCache();
      _api2.default.loadLists().then(function () {
        if (_api2.default.hasDefaultList()) {
          IndexController.loadTasks(page);
        } else {

          // Create a default list if none exists
          _api2.default.createDefaultList().then(function () {
            IndexController.loadTasks(page);
          });
        }
      });
    } else if (!_api2.default.tasksLoaded) {
      IndexController.loadTasks(page);
    } else {
      IndexController.invalidate(page);
    }

    IndexController.bind(page);
  },
  loadTasks: function loadTasks(page) {
    _api2.default.loadTasks().then(function () {
      IndexController.invalidate(page);
    });
  },
  uninit: function uninit() {
    console.log('uninitialize tasks addon');
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

      // Inherit list filters from list when quick adding tasks
      data.filters = list.filters;

      $$(this).find('input[name="name"]').val('');
      _api2.default.saveTask(data).then(function () {
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

    $page.on('click', 'a.task-card', function () {
      var href = $$(this).data('href');

      // if (API.isTablet()) {
      $$.get(href, function (response) {
        var $popup = $$('<div class="popup" data-page="tasks__task" id="tasks__tasks"></div>');
        $popup.append(response);
        $popup.find('.back').removeClass('back');
        $popup.find('.page').addClass('navbar-fixed');
        window.tommy.f7.popup($popup);
        _task2.default.init({
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
    // if (!IndexController.listsLoaded || !IndexController.tasksLoaded) return;

    console.log('invalidating tasks index');
    var $page = $$(page.container);
    if (IndexController.invalidateLists || !$page.find('.card').length) {
      console.log('rendering task lists');
      IndexController.invalidateLists = false;
      window.tommy.tplManager.renderInline('tasks__listsTemplate', _api2.default.getOrderedLists(), page.container);

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
      var tasks = _api2.default.getListTasks(listId);
      window.tommy.tplManager.renderTarget('tasks__listTasksTemplate', tasks, $e);
    }

    var actor = window.tommy.addons.getCurrentActor();
    if (actor) {
      window.tommy.app.setPageTitle(window.tommy.i18n.t('index.title_user', { user: actor.first_name }));
    }
  }
};

exports.default = IndexController;

},{"../api":1,"./task":8}],4:[function(require,module,exports){
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

    // Default list filters show tasks tagged with current user
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

var _index = require('./index');

var _index2 = _interopRequireDefault(_index);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ListEditController = {
  init: function init(page) {
    var list = _api2.default.cache['lists'][page.query.list_fragment_id];
    var $page = $$(page.container);
    var $nav = $$(page.navbarInnerContainer);

    console.log('edit list', list);

    // NOTE: we should probably check that the current user has
    // `task_list_edit_access` permission before rendering the page.

    window.tommy.tplManager.renderInline('tasks__listEditTemplate', list, $page);

    ListEditController.initListFilters(page, list);
    _api2.default.initPermissionSelect(page, 'task_list_read_access', list.id);
    _api2.default.initPermissionSelect(page, 'task_list_edit_access', list.id);

    $nav.find('a.save').on('click', function (ev) {
      var data = window.tommy.app.f7.formToJSON($page.find('form'));
      ListEditController.saveList(list, data);
      ev.preventDefault();
    });

    $page.find('.date-range-select').on('click', function (ev) {
      ListEditController.showDateRangePopup(page, list);
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
  showDateRangePopup: function showDateRangePopup(page, list) {
    var html = window.tommy.tplManager.render('tasks__dateRangeSelectTemplate', list.data);
    // let $popup = $$('<div class="popup" data-page="tasks__date-range-select"></div>')
    // $popup.append(html)
    // $popup.append(html)
    // console.log('POPUP', $popup)
    // window.tommy.f7.popup($popup)
    window.tommy.f7.popup(html);
  },
  initListFilters: function initListFilters(page, list) {
    // if (!list.filters)
    //     list.filters = []
    var object = {
      title: window.tommy.i18n.t('parmissions.filter_tasks.title'),
      name: 'filter_tasks'
    };
    var $tagSelect = window.tommy.tplManager.appendInline('tasks__tagSelectTemplate', object, page.container);
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

},{"../api":1,"./index":3}],6:[function(require,module,exports){
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

    window.tommy.tplManager.renderInline('tasks__listManagementTemplate', _api2.default.getOrderedLists(), $page);

    $nav.find('a.save').on('click', function (ev) {
      var data = window.tommy.app.f7.formToJSON($page.find('form'));
      ListManagementController.save(page, data);
      ev.preventDefault();
    });
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

var TaskAddController = {
  init: function init(page) {
    var $page = $$(page.container);
    var $nav = $$(page.navbarInnerContainer);

    window.tommy.tplManager.renderInline('tasks__addTaskTemplate', {}, $page); // API.cache['lists']

    $nav.find('a.save').on('click', function (ev) {
      var data = window.tommy.app.f7.formToJSON($page.find('form'));
      data.filters = [_api2.default.currentUserTag()]; // tag the current user
      TaskAddController.saveTask(data);
      ev.preventDefault();
    });
  },
  saveTask: function saveTask(data) {
    _api2.default.saveTask(data).then(TaskAddController.afterSave);
  },
  afterSave: function afterSave(res) {
    console.log('task saved', res);
    window.tommy.app.f7view.router.back();
  }
};

exports.default = TaskAddController;

},{"../api":1}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _api = require('../api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var TaskController = {
  init: function init(page) {
    var task = _api2.default.cache['tasks'][page.query.task_fragment_id];
    var $page = $$(page.container);
    var $navbar = $$(page.navbarInnerContainer);

    var f7 = window.tommy.app.f7;

    console.log('init task details', task);
    window.tommy.tplManager.renderInline('tasks__taskDetailsTemplate', task, $page.parent());

    $page.find('.task-menu-popover').on('popover:open', function () {
      // BUG: popover shows offscreen on desktop, this fixes it
      $$(window).trigger('resize');
    });

    $page.find('.task-menu-popover a').click(function (e) {
      var command = $$(e.target).data('command');

      switch (command) {
        case 'add-checklist':
          TaskController.renderChecklist(page);
          break;
        case 'add-end-time':
          TaskController.renderDeadline(page);
          break;
        default:
          alert('Unknown command: ' + command);
      }

      f7.closeModal('.task-menu-popover');
    });

    // Task title area
    // TODO: make into a reuasble module
    $page.find('.page-content').scroll(function (e) {
      if (e.target.scrollTop > 100) {
        $navbar.addClass('with-title');
      } else {
        $navbar.removeClass('with-title');
      }
    });

    // Task status picker
    TaskController.initStatusPicker(page);

    // Task checklist actions
    if (task.data.checklist && task.data.checklist.items) {
      TaskController.renderChecklist(page);
    }

    // Task deadline
    if (task.end_at) {
      TaskController.renderDeadline(page);
    }

    // Task activity
    var myMessagebar = f7.messagebar('.messagebar', { maxHeight: 200 });
    myMessagebar.textarea.on('change input', function (e) {
      var value = myMessagebar.value().trim();
      if (value) myMessagebar.textarea.addClass('with-value');else myMessagebar.textarea.removeClass('with-value');
    });
    $page.find('.add-comment').click(function () {
      var value = myMessagebar.value().trim();
      if (!value) return;
      TaskController.addActivity(page, 'comment', myMessagebar.value());
      myMessagebar.clear();
    });
    TaskController.renderActivity(page);

    // Task participants
    var $tagSelect = $page.find('.tag-select');
    var participants = [];
    if (task.filters) {
      participants = task.filters;
    }
    console.log('init task participants', participants, $tagSelect.length);
    window.tommy.tplManager.renderInline('tasks__taskParticipantsTemplate', participants, $page);
    window.tommy.tagSelect.initWidget($tagSelect, participants, function (data) {
      console.log('task participants changed', data);
      task.filters = data;
      window.tommy.tplManager.renderInline('tasks__taskParticipantsTemplate', task.filters, page.container);
      TaskController.saveTask(page);
    });

    // Task name inline editing
    var $editTaskName = $page.find('textarea.edit-task-name');
    $editTaskName.on('focus', function () {
      TaskController.enableEditName(page, true);
    });
    f7.resizableTextarea('textarea.edit-task-name');
    f7.resizeTextarea('textarea.edit-task-name');

    // Task description inline editing
    var $editTaskDescription = $page.find('textarea.edit-task-description');
    $editTaskDescription.on('focus', function () {
      TaskController.enableEditDescription(page, true);
    });
    f7.resizableTextarea('textarea.edit-task-description');
    f7.resizeTextarea('textarea.edit-task-description');

    // Save button
    $navbar.find('a.save').on('click', function () {
      TaskController.saveTask(page);
      TaskController.enableSave(page, false);
    });

    TaskController.invalidate(page);
  },
  invalidate: function invalidate(page) {
    var task = _api2.default.cache['tasks'][page.query.task_fragment_id];

    // Page title must be set after animation
    // window.tommy.app.setPageTitle(task.name)
    var $navbar = $$(page.navbarInnerContainer);
    $navbar.find('.center').text(task.name);
  },
  renderActivity: function renderActivity(page) {
    var task = _api2.default.cache['tasks'][page.query.task_fragment_id];
    var $page = $$(page.container);

    var items = [];
    if (task.data.activity) {
      items = task.data.activity;
    }
    window.tommy.tplManager.renderInline('tasks__taskActivityTemplate', items, $page);
  },
  addActivity: function addActivity(page, type, text) {
    var task = _api2.default.cache['tasks'][page.query.task_fragment_id];
    _api2.default.addTaskActivity(task, type, text);

    TaskController.renderActivity(page);
    TaskController.saveTask(page);
  },
  renderChecklist: function renderChecklist(page) {
    var task = _api2.default.cache['tasks'][page.query.task_fragment_id];
    var $page = $$(page.container);

    var items = [];
    if (task.data.checklist && task.data.checklist.items) {
      items = task.data.checklist.items;
    }
    window.tommy.tplManager.renderInline('tasks__taskChecklistTemplate', items, $page);

    var $input = $page.find('input.add-checklist-item');
    $input.on('blur', function () {
      var text = $$(this).val();
      task = _api2.default.cache['tasks'][page.query.task_fragment_id];
      if (!text || !text.length) {
        return;
      }

      if (!task.data.checklist) {
        task.data.checklist = {};
      }
      if (!task.data.checklist.items) {
        task.data.checklist.items = [];
      }
      task.data.checklist.items.push({
        text: text,
        complete: false
      });
      TaskController.renderChecklist(page);
      TaskController.saveTask(page);
    });
    $page.find('.remove-checklist').click(function () {
      task = _api2.default.cache['tasks'][page.query.task_fragment_id];
      // TODO: confirm alert
      task.data.checklist = {};
      $page.find('[data-template="tasks__taskChecklistTemplate"]').html('');
      TaskController.saveTask(page);
    });
    $page.find('.remove-checklist-item').click(function () {
      task = _api2.default.cache['tasks'][page.query.task_fragment_id];
      var index = parseInt($$(this).parents('li').data('checklist-item'));

      console.log('removing checklist item', index);
      task.data.checklist.items.splice(index, 1);
      TaskController.renderChecklist(page);

      TaskController.saveTask(page);
    });
    $page.find('.checklist-item').click(function (e) {
      var $target = $$(e.target);
      if ($target.hasClass('remove-checklist-item') || $target.parents('.remove-checklist-item').length) {
        return;
      }
      var index = parseInt($$(this).parents('li').data('checklist-item'));
      var isChecked = $$(this).hasClass('checked');
      task = _api2.default.cache['tasks'][page.query.task_fragment_id];
      console.log('toggle checklist item', index);
      if (isChecked) {
        $$(this).removeClass('checked');
        task.data.checklist.items[index].complete = false;
      } else {
        $$(this).addClass('checked');
        task.data.checklist.items[index].complete = true;
      }

      TaskController.saveTask(page);
    });
  },
  renderDeadline: function renderDeadline(page) {
    var task = _api2.default.cache['tasks'][page.query.task_fragment_id];
    var $page = $$(page.container);

    console.log('render deadline', task.end_at);
    window.tommy.tplManager.renderInline('tasks__taskDeadlineTemplate', task.end_at, $page);

    var $input = $page.find('input.edit-task-deadline');
    var format = 'dddd, MMM Do YY, h:mm a';
    var picker = window.tommy.util.createDatePicker($input, task.end_at, {
      onClose: function onClose() {
        console.log('closing deadline picker', picker.currentDate);
        task.end_at = picker.currentDate;
        TaskController.saveTask(page);
      },
      onFormat: function onFormat(date) {
        console.log('format deadline picker', date);
        return window.tommy.util.humanTime(date);
      }
    });

    if (!task.end_at) {
      $input.val('');
    }

    $page.on('click', '.remove-deadline', function () {
      // TODO: confirm alert
      delete task.end_at;
      $page.find('[data-template="tasks__taskDeadlineTemplate"]').html('');
      TaskController.saveTask(page);
    });
  },
  initStatusPicker: function initStatusPicker(page) {
    var task = _api2.default.cache['tasks'][page.query.task_fragment_id];
    var initial = task.status === 'Unassigned' ? window.tommy.i18n.t('task.waiting_for_assignments') : _api2.default.translateStatus(task.status);

    return window.tommy.app.f7.picker({
      input: $$(page.container).find('.task-status-picker'),
      value: [initial],
      convertToPopover: false,
      cols: [{
        textAlign: 'center',
        values: _api2.default.translatedStatuses()
      }],
      onClose: function onClose(p) {
        var translatedStatus = p.value[0];
        var status = _api2.default.untranslateStatus(p.value[0]);
        if (status == task.status) {
          return;
        }
        task.status = status;
        TaskController.addActivity(page, 'status', window.tommy.i18n.t('task.changed_status_to', { status: translatedStatus }));
        TaskController.saveTask(page);
      }
    });
  },
  saveTask: function saveTask(page) {
    var task = _api2.default.cache['tasks'][page.query.task_fragment_id];

    console.log('saving task fragment', task);
    _api2.default.saveTask(task);
  },
  enableEditName: function enableEditName(page, flag) {
    var task = _api2.default.cache['tasks'][page.query.task_fragment_id];
    var $page = $$(page.container);
    var $textarea = $page.find('textarea.edit-task-name');

    if (flag != false) {
      $textarea.once('focusout', function () {
        var newValue = $textarea.val();
        if (task.name !== newValue) {
          task.name = newValue;
          TaskController.saveTask(page);
          console.log('set task name', task.name);
        }
      });
    }
  },
  enableEditDescription: function enableEditDescription(page, flag) {
    var task = _api2.default.cache['tasks'][page.query.task_fragment_id];
    var $page = $$(page.container);
    var $textarea = $page.find('textarea.edit-task-description');

    if (flag != false) {
      $textarea.once('focusout', function () {
        var newValue = $textarea.val();
        if (task.data.description !== newValue) {
          task.data.description = newValue;
          TaskController.saveTask(page);
          console.log('set task description', task.data.description);
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

exports.default = TaskController;

},{"../api":1}],9:[function(require,module,exports){
'use strict';

var _api = require('./api');

var _api2 = _interopRequireDefault(_api);

var _index = require('./controllers/index');

var _index2 = _interopRequireDefault(_index);

var _task = require('./controllers/task');

var _task2 = _interopRequireDefault(_task);

var _taskAdd = require('./controllers/task-add');

var _taskAdd2 = _interopRequireDefault(_taskAdd);

var _listAdd = require('./controllers/list-add');

var _listAdd2 = _interopRequireDefault(_listAdd);

var _listEdit = require('./controllers/list-edit');

var _listEdit2 = _interopRequireDefault(_listEdit);

var _listManagement = require('./controllers/list-management');

var _listManagement2 = _interopRequireDefault(_listManagement);

var _boardSettings = require('./controllers/board-settings');

var _boardSettings2 = _interopRequireDefault(_boardSettings);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

//
// == Router

window.tommy.app.f7.onPageInit('tasks__index', _index2.default.init);
window.tommy.app.f7.onPageBack('tasks__index', _index2.default.uninit);
window.tommy.app.f7.onPageAfterAnimation('tasks__index', _index2.default.invalidate);
window.tommy.app.f7.onPageInit('tasks__board-settings', _boardSettings2.default.init);
window.tommy.app.f7.onPageInit('tasks__list-add', _listAdd2.default.init);
window.tommy.app.f7.onPageInit('tasks__list-edit', _listEdit2.default.init);
window.tommy.app.f7.onPageInit('tasks__list-management', _listManagement2.default.init);
window.tommy.app.f7.onPageAfterAnimation('tasks__list-management', _listManagement2.default.init);
window.tommy.app.f7.onPageInit('tasks__task-add', _taskAdd2.default.init);
window.tommy.app.f7.onPageInit('tasks__task', _task2.default.init);
window.tommy.app.f7.onPageAfterAnimation('tasks__task', _task2.default.invalidate);

//
// == Template7 Helpers

window.tommy.app.t7.registerHelper('tasks__checklistNumCompleted', function (checklist) {
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

window.tommy.app.t7.registerHelper('tasks__displayStatus', function (status) {
  return _api2.default.translateStatus(status);
});

window.tommy.app.t7.registerHelper('tasks__displayStatuses', function (statuses) {
  if (statuses) {
    return statuses.map(function (x) {
      return _api2.default.translateStatus(x);
    }).join(', ');
  } else {
    return '';
  }
});

window.tommy.app.t7.registerHelper('tasks__statusSelectOptions', function (statuses) {
  var ret = '';
  for (var i = 0; i < _api2.default.STATUSES.length; i++) {
    var status = _api2.default.STATUSES[i];
    var selected = statuses && statuses.indexOf(status) !== -1;
    ret += '<option value="' + status + '" ' + (selected ? 'selected' : '') + '>' + _api2.default.translateStatus(status) + '</option>';
  }
  return ret;
});

window.tommy.app.t7.registerHelper('tasks__ifCanEditList', function (list, options) {
  var account = window.tommy.config.getCurrentAccount();

  // BUG: Due to some unknown bug `this` is undefined in this function,
  // so substituting with the `list` variable for return variables
  // console.log('tasks__canEditList', this, list, options)

  // Default lists (the list automatically created for each team member) can
  // only be edited by admins
  if (list.data.default && !window.tommy.util.isTeamOwnerOrManager(account)) return options.inverse(list, options.data);

  if (list.permission_to.indexOf('update') !== -1) return options.fn(list, options.data);else return options.inverse(list, options.data);
});

window.tommy.app.t7.registerHelper('tasks__displayDateRange', function (range) {
  return range;
});

},{"./api":1,"./controllers/board-settings":2,"./controllers/index":3,"./controllers/list-add":4,"./controllers/list-edit":5,"./controllers/list-management":6,"./controllers/task":8,"./controllers/task-add":7}]},{},[9]);
