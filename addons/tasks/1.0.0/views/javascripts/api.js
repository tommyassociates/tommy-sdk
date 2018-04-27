import IndexController from './controllers/index'

const API = {
  listsLoaded: false,
  tasksLoaded: false,
  cache: {},

  initCache () {
    API.cache = {
      lists: {},
      tasks: {}
    }
  },

  getOrderedLists () {
    const lists = Object.values(API.cache['lists'])
    if (!lists.length) return []
    return lists.sort(function(a, b) {
      return a.data.order - b.data.order // ascending order
    })
  },

  addTask (item) {
    API.cache['tasks'][item.id] = item
    console.log('task added', item)
  },

  addTasks (items) {
    API.tasksLoaded = true
    if (items && items.length) {
      for (let i = 0; i < items.length; i++) {
        if (Array.isArray(items[i]))
          API.addTasks(items[i])
        else
          API.addTask(items[i])
      }
    }
  },

  getListTasks (listId) {
    const list = API.cache['lists'][listId]
    const tasks = []
    for (const taskId in API.cache['tasks']) {
      let task = API.cache['tasks'][taskId]

      if (list.filters && task.filters) {
        let taskTags = task.filters.map(x => x.name)
        let listTags = list.filters.map(x => x.name)
        let matches = taskTags.filter(x => listTags.indexOf(x) !== -1)
        console.log('should add task to list', task.name, list.name, matches)

        if (matches.length) {
          tasks.push(task)
        }
      }
    }

    // Back when life was simple:
    // let task
    // for (const taskId in API.cache['tasks']) {
    //   task = API.cache['tasks'][taskId]
    //   if (task.parent_id == listId) { tasks.push(task) }
    // }
    return tasks
  },

  loadTasks () { // params
    console.log('load tasks') // params

    let name, tags, params, request, promises = []
    for (const listId in API.cache['lists']) {
      const list = API.cache['lists'][listId]
      name = window.tommy.config.getCurrentUserName()
      tags = [ name ]
      console.log(window.tommy.config.getCurrentUser())
      if (list.data && list.filters) {
        for (let i = 0; i < list.filters.length; i++) {
          tags.push(list.filters[i].name)
        }
      }

      params = {
        addon: 'tasks',
        kind: 'Task',
        tags: tags
      }
      request = window.tommy.api.getFragments(params) //.then(API.addTasks)
      promises.push(request)
    }

    return Promise.all(promises).then(API.addTasks)

    // Back when life was simple:
    // params = Object.assign({
    //   addon: 'tasks',
    //   kind: 'Task'
    // }, params)
    // return window.tommy.api.getFragments(params).then(API.addTasks)
  },

  // loadTasks (params) {
  //   console.log('load tasks', params)
  //
  //   params = Object.assign({
  //     addon: 'tasks',
  //     kind: 'Task'
  //   }, params)
  //   return window.tommy.api.getFragments(params).then(API.addTasks)
  // },

  addTaskActivity (task, type, text) {
    const currentUser = window.tommy.config.getCurrentUser()
    const activity = {
      type,
      text,
      time: new Date(),
      user_id: currentUser.id,
      user_name: currentUser.first_name
    }

    if (!task.data) { task.data = {} }
    if (!task.data.activity) { task.data.activity = [] }
    task.data.activity.unshift(activity)

    return activity
  },

  saveTask (task) {
    console.log('save task', task)
    if (!task.name) {
      alert('Task name must be set')
      return
    }
    // if (!task.parent_id) {
    //   alert('Task must belong to a list')
    //   return
    // }

    task.addon = 'tasks'
    task.kind = 'Task'
    if (!task.id) { API.addTaskActivity(task, 'status', window.tommy.i18n.t('task.created_a_task')) }
    const params = Object.assign({}, task, { data: JSON.stringify(task.data) })
    if (task.id) { return window.tommy.api.updateFragment(task.id, params).then(API.addTask) } else { return window.tommy.api.createFragment(params).then(API.addTask) }
  },

  addList (item) {
    API.cache['lists'][item.id] = item
    console.log('added task list', item)
  },

  addLists (items) {
    API.listsLoaded = true
    if (items && items.length) {
      for (let i = 0; i < items.length; i++) {
        API.addList(items[i])
      }
    }
  },

  loadLists (params) {
    console.log('load task lists', params)

    params = Object.assign({
      addon: 'tasks',
      kind: 'TaskList'
    }, params)
    return window.tommy.api.getFragments(params).then(API.addLists)
  },

  deleteList (listId) {
    delete API.cache['lists'][listId]
    console.log('delete list', listId)
    return window.tommy.api.deleteFragment(listId)
  },

  saveList (list) {
    console.log('save list', list)
    IndexController.invalidateLists = true // rerender lists
    list.addon = 'tasks'
    list.kind = 'TaskList'
    if (!list.data) { list.data = {} }
    if (typeof (list.data.order) === 'undefined') { list.data.order = Object.keys(API.cache['lists']).length }
    if (typeof (list.data.active) === 'undefined') { list.data.active = true }
    if (typeof (list.data.show_fast_add) === 'undefined') { list.data.show_fast_add = true }
    const params = Object.assign({}, list, { data: JSON.stringify(list.data) })
    if (list.id) {
      return window.tommy.api.updateFragment(list.id, params).then(API.addList)
    }
    else {
      return window.tommy.api.createFragment(params).then(API.addList)
    }
  },

  createDefaultList () {
    console.log('creating deafult task list')
    var list = {
      name: window.tommy.i18n.t('index.default-task-name'),
      data: {
        default: true
      },
      
      // Default list filters show tasks tagged with current user
      filters: [
        {
          context: 'members',
          name: window.tommy.config.getCurrentUserName(),
          user_id: window.tommy.config.getCurrentUserId()
        }
      ]
    }
    return API.saveList(list)
  },

  hasLists () {
    return Object.keys(API.cache['lists']).length > 0
  },

  initPermissionSelects (page, permissionNames) {
    window.tommy.api.getInstalledAddonPermissions('tasks', { cache: true }).then(permissions => {
      console.log('installed addon permissions', permissions)
      permissions = permissions.filter(x => permissionNames.indexOf(x.name) !== -1);
      // window.tommy.tplManager.renderInline('tasks__tagSelectTemplate', permissions, page.container)
      for (var i = 0; i < permissions.length; i++) {
        console.log('init permissions', permissions[i])
        window.tommy.tplManager.appendInline('tasks__tagSelectTemplate', permissions[i], page.container)
        API.initTagSelect(page, permissions[i])
      }
    })
  },

  initTagSelect (page, permission) {
    var $tagSelect = $$(page.container).find('.tag-select[data-permission-name="' + permission.name + '"]') //.find('') //$page.find('#addon-permissions-form .tag-select')
    console.log('init tag select', permission, $tagSelect)
    window.tommy.tagSelect.initWidget($tagSelect, permission.filters, function(data) {
      console.log('save tags', permission, data, $tagSelect.dataset())

      // $tagSelect.data('permission-name')
      window.tommy.api.updateInstalledAddonPermission('tasks', permission.name, {
        filters: JSON.stringify(data)
      })
    })
  },

  isTablet () {
    return window.innerWidth >= 630
  }
}

export default API
