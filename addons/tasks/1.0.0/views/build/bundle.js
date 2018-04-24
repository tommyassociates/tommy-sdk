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
  addTask: function addTask(item) {
    API.cache['tasks'][item.id] = item;
    // console.log('task added', item)
  },
  addTasks: function addTasks(items) {
    API.tasksLoaded = true;
    if (items && items.length) {
      for (var i = 0; i < items.length; i++) {
        API.addTask(items[i]);
      }
    }
  },
  getListTasks: function getListTasks(listId) {
    var tasks = [];
    var task = void 0;
    for (var taskId in API.cache['tasks']) {
      task = API.cache['tasks'][taskId];
      if (task.parent_id == listId) {
        tasks.push(task);
      }
    }
    return tasks;
  },
  loadTasks: function loadTasks(params) {
    console.log('load tasks', params);

    params = Object.assign({
      addon: 'tasks',
      kind: 'Task'
    }, params);
    return window.tommy.api.getFragments(params).then(API.addTasks);
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
    console.log(task);
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
    if (!task.parent_id) {
      alert('Task must belong to a list');
      return;
    }

    task.addon = 'tasks';
    task.kind = 'Task';
    if (!task.id) {
      API.addTaskActivity(task, 'status', 'Created a task');
    }
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
      kind: 'TaskList'
    }, params);
    return window.tommy.api.getFragments(params).then(API.addLists);
  },
  deleteList: function deleteList(listId) {
    delete API.cache['lists'][listId];
    console.log('delete list', listId);
    return window.tommy.api.deleteFragment(listId);
  },
  saveList: function saveList(list) {
    console.log('save list', list);
    _index2.default.invalidateLists = true; // rerender lists
    list.addon = 'tasks';
    list.kind = 'TaskList';
    if (!list.data) {
      list.data = {};
    }
    if (typeof list.data.order === 'undefined') {
      list.data.order = Object.keys(API.cache['lists']).length;
    }
    if (typeof list.data.active === 'undefined') {
      list.data.active = true;
    }
    if (typeof list.data.show_fast_add === 'undefined') {
      list.data.show_fast_add = true;
    }
    var params = Object.assign({}, list, { data: JSON.stringify(list.data) });
    if (list.id) {
      return window.tommy.api.updateFragment(list.id, params).then(API.addList);
    } else {
      return window.tommy.api.createFragment(params).then(API.addList);
    }
  },
  createDefaultList: function createDefaultList() {
    console.log('creating deafult task list');
    return API.saveList({ name: window.tommy.i18n.t('index.default-task-name') });
  },
  hasLists: function hasLists() {
    return Object.keys(API.cache['lists']).length > 0;
  },
  initPermissionSelects: function initPermissionSelects(page, permissionNames) {
    window.tommy.api.getInstalledAddonPermissions('tasks', { cache: true }).then(function (permissions) {
      console.log('installed addon permissions', permissions);
      permissions = permissions.filter(function (x) {
        return permissionNames.indexOf(x.name) !== -1;
      });
      window.tommy.tplManager.renderInline('tasks__permissionsTagSelectTemplate', permissions, page.container);
      for (var i = 0; i < permissions.length; i++) {
        API.initTagSelect(page, permissions[i]);
      }
    });
  },
  initTagSelect: function initTagSelect(page, permission) {
    var $tagSelect = $$(page.container).find('.tag-select[data-permission-name="' + permission.name + '"]'); //.find('') //$page.find('#addon-permissions-form .tag-select')
    console.log('init tag select', permission, $tagSelect);
    window.tommy.tagSelect.initWidget($tagSelect, permission.filters, function (data) {
      console.log('save tags', permission, data, $tagSelect.dataset());

      // $tagSelect.data('permission-name')
      window.tommy.api.updateInstalledAddonPermission('tasks', permission.name, {
        filters: JSON.stringify(data)
      });
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

var BoardSettingsController = {
  init: function init(page) {
    var $page = $$(page.container);
    var $nav = $$(page.navbarInnerContainer);

    window.tommy.tplManager.renderInline('tasks__boardSettingTemplate', null, $page);

    _api2.default.initPermissionSelects(page, ['task_create_access', 'task_edit_access']);

    $nav.find('a.save').on('click', function (ev) {
      var data = window.tommy.app.f7.formToJSON($page.find('form'));

      // NOTE: Form not implemented yet
      ev.preventDefault();
    });
  },
  saveList: function saveList() {},
  afterSave: function afterSave(res) {
    // console.log('board saved', res)
    // window.tommy.app.f7view.router.back()
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

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var IndexController = {
  init: function init(page) {
    if (!_api2.default.listsLoaded || !_api2.default.tasksLoaded) {
      _api2.default.initCache();
      _api2.default.loadLists().then(function () {
        if (_api2.default.hasLists()) {
          IndexController.invalidate(page);
        } else {

          // Create a default list if none exists
          _api2.default.createDefaultList().then(function () {
            IndexController.invalidate(page);
          });
        }
      });
      _api2.default.loadTasks().then(function () {
        IndexController.invalidate(page);
      });
    }

    // IndexController.invalidate(page)
    IndexController.bind(page);
  },
  uninit: function uninit() {
    console.log('tasks uninitialize');
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
      var data = window.tommy.app.f7.formToJSON(this);
      $$(this).find('input[name="name"]').val('');
      _api2.default.saveTask(data).then(function () {
        IndexController.invalidate(page);
      });
    });
  },
  invalidate: function invalidate(page) {
    // if (!IndexController.listsLoaded || !IndexController.tasksLoaded) return;

    console.log('invalidating tasks index');
    var $page = $$(page.container);
    if (IndexController.invalidateLists || !$page.find('.card').length) {
      IndexController.invalidateLists = false;
      window.tommy.tplManager.renderInline('tasks__listsTemplate', _api2.default.cache['lists'], page.container);

      var isTablet = window.innerWidth >= 630;
      var swiper = window.tommy.app.f7.swiper('.swiper-container', {
        centeredSlides: !isTablet,
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
    window.tommy.tplManager.renderInline('tasks__listEditTemplate', list, $page);

    _api2.default.initPermissionSelects(page, ['task_list_read_access', 'task_list_edit_access']);

    $nav.find('a.save').on('click', function (ev) {
      var data = window.tommy.app.f7.formToJSON($page.find('form'));
      ListEditController.saveList(list, data);
      ev.preventDefault();
    });

    $page.find('.delete-list').on('click', function (ev) {
      _api2.default.deleteList(list.id);
      _index2.default.invalidateLists = true;
      window.tommy.app.f7view.router.back();
      ev.preventDefault();
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

//
/// List Management Controller

var ListManagementController = {
  init: function init(page) {
    var $page = $$(page.container);
    var $nav = $$(page.navbarInnerContainer);

    // console.log('edit list', list)
    window.tommy.tplManager.renderInline('tasks__listManagementTemplate', _api2.default.cache['lists'], $page);

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

      if (list.data.order != index || list.data.active != active) {
        list.data.order = index;
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

//
/// Task Add Controller

var TaskAddController = {
  init: function init(page) {
    var $page = $$(page.container);
    var $nav = $$(page.navbarInnerContainer);

    window.tommy.tplManager.renderInline('tasks__addTaskTemplate', _api2.default.cache['lists'], $page);

    $nav.find('a.save').on('click', function (ev) {
      var data = window.tommy.app.f7.formToJSON($page.find('form'));
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

    console.log('init task details', task);
    window.tommy.tplManager.renderInline('tasks__taskDetailsTemplate', task, $page.parent());

    $page.find('.task-menu-popover a').click(function () {
      var command = $$(this).data('command');

      switch (command) {
        case 'add-checklist':
          TaskController.renderChecklist(page);
          break;
        case 'add-end-time':
          TaskController.renderDeadline(page);
          break;
      }

      window.tommy.app.f7.closeModal();
    });

    // Take title area
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
    if (task.data.deadline) {
      TaskController.renderDeadline(page);
    }

    // Task activity
    var myMessagebar = window.tommy.app.f7.messagebar('.messagebar', { maxHeight: 200 });
    $page.find('.add-comment').click(function () {
      TaskController.addActivity(page, 'comment', myMessagebar.value());
      myMessagebar.clear();
    });
    TaskController.renderActivity(page);

    // Task participants
    var $tagSelect = $page.find('.tag-select');
    var participants = [];
    if (task.data.participants) {
      participants = task.data.participants;
    }
    window.tommy.tplManager.renderInline('tasks__taskParticipantsTemplate', participants, $page);
    window.tommy.tagSelect.initWidget($tagSelect, participants, function (data) {
      console.log('task participants changed', data);
      task.data.participants = data;
      window.tommy.tplManager.renderInline('tasks__taskParticipantsTemplate', task.data.participants, $page);
      TaskController.enableSave(page, true);
    });

    // Task name inline editing
    var $editTaskName = $page.find('input.edit-task-name');
    $editTaskName.on('click', function () {
      TaskController.enableEditName(page, true);
    });

    // Task description inline editing
    var $editTaskDescription = $page.find('textarea.edit-task-description');
    $editTaskDescription.on('click', function () {
      TaskController.enableEditDescription(page, true);
    });

    // Save button
    $navbar.find('a.save').on('click', function () {
      TaskController.saveTask(page);
      TaskController.enableSave(page, false);
    });
  },
  invalidate: function invalidate(page) {
    var task = _api2.default.cache['tasks'][page.query.task_fragment_id];

    // Page title must be set after animation
    window.tommy.app.setPageTitle(task.name);
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
    $input.on('focusout', function () {
      var text = $$(this).val();
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
      // window.tommy.tplManager.renderInline('tasks__taskChecklistTemplate', task.data.checklist.items, $page)
    });
    $input.on('focusin', function () {
      TaskController.enableSave(page);
      // if (!task.data.checklist)
      //     task.data.checklist = {}
      // if (!task.data.checklist.items)
      //     task.data.checklist.items = []
      // task.data.checklist.items.push({
      //     text: $$(this).val(),
      //     complete: false
      // })
      //
      // window.tommy.tplManager.renderInline('tasks__taskChecklistTemplate', task.data.checklist.items, $page)
    });
    $page.find('.remove-checklist').click(function () {
      // TODO: confirm alert
      task.data.checklist = {};
      $page.find('[data-template="tasks__taskChecklistTemplate"]').html('');
      TaskController.saveTask(page);
    });
    $page.find('.remove-checklist-item').click(function () {
      var index = parseInt($$(this).parents('li').data('checklist-item'));

      console.log('removing checklist item', index);
      task.data.checklist.items.splice(index, 1);
      TaskController.renderChecklist(page);

      TaskController.enableSave(page);
      // TaskController.saveTask(page)
    });
    $page.find('.checklist-item').click(function () {
      var index = parseInt($$(this).parents('li').data('checklist-item'));
      var isChecked = $$(this).hasClass('checked');

      console.log('toggle checklist item', index);
      if (isChecked) {
        $$(this).removeClass('checked');
        task.data.checklist.items[index].complete = false;
      } else {
        $$(this).addClass('checked');
        task.data.checklist.items[index].complete = true;
      }

      TaskController.enableSave(page);
      // TaskController.saveTask(page)
    });
  },
  renderDeadline: function renderDeadline(page) {
    var task = _api2.default.cache['tasks'][page.query.task_fragment_id];
    var $page = $$(page.container);

    window.tommy.tplManager.renderInline('tasks__taskDeadlineTemplate', task.data.deadline, $page);

    var $input = $page.find('input.edit-task-deadline');
    var format = 'dddd, MMM Do YY, h:mm a';
    var picker = window.tommy.util.createDatePicker($input, task.data.deadline, {
      onClose: function onClose() {
        console.log('closing deadline picker', picker.currentDate);
        task.data.deadline = picker.currentDate;
        TaskController.enableSave(page);
      },
      onFormat: function onFormat(date) {
        console.log('format deadline picker', date);
        return window.tommy.util.humanTime(date);
        // task.data.deadline = picker.currentDate
        // TaskController.enableSave(page)
      }
    });

    if (!task.data.deadline) {
      $input.val('');
    }

    $page.on('click', '.remove-deadline', function () {
      // TODO: confirm alert
      delete task.data.deadline;
      $page.find('[data-template="tasks__taskDeadlineTemplate"]').html('');
      TaskController.saveTask(page);
    });
  },
  initStatusPicker: function initStatusPicker(page) {
    var task = _api2.default.cache['tasks'][page.query.task_fragment_id];
    var STATUS = ['Unassigned', 'Assigned', 'Processing', 'Completed', 'Closed', 'Archive Task', 'Cancel'];

    return window.tommy.app.f7.picker({
      input: $$(page.container).find('.task-status-picker'),
      value: [task.data.status],
      convertToPopover: false,
      cols: [{
        textAlign: 'center',
        values: STATUS
      }],
      onClose: function onClose(p) {
        var status = p.value[0];
        if (status == task.data.status) {
          return;
        }
        task.data.status = status;
        TaskController.addActivity(page, 'status', 'Changed status to ' + task.data.status);
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
    var $input = $page.find('input.edit-task-name');

    if (flag != false) {
      // $textarea.removeClass('unstyled')
      TaskController.enableSave(page, true);

      $input.on('focusout', function () {
        task.name = $input.val();
        console.log('set task name', task.name);
      });
    }
  },
  enableEditDescription: function enableEditDescription(page, flag) {
    var task = _api2.default.cache['tasks'][page.query.task_fragment_id];
    var $page = $$(page.container);
    var $textarea = $page.find('textarea.edit-task-description');

    if (flag != false) {
      // $textarea.removeClass('unstyled')
      TaskController.enableSave(page, true);

      $textarea.on('focusout', function () {
        task.data.description = $textarea.val();
        console.log('set task description', task.data.description);
        TaskController.enableEditDescription(page, false);
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
  return window.tommy.i18n.t('status.' + window.tommy.util.underscore(status), { defaultValue: status });
});

},{"./controllers/board-settings":2,"./controllers/index":3,"./controllers/list-add":4,"./controllers/list-edit":5,"./controllers/list-management":6,"./controllers/task":8,"./controllers/task-add":7}]},{},[9]);
