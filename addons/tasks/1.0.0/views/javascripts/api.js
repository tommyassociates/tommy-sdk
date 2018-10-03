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
    if (!API.cache['lists']) return []
    const lists = Object.values(API.cache['lists'])
    if (!lists.length) return []
    return lists.sort(function(a, b) {
      return a.data.position - b.data.position // ascending order
    })
  },

  addTask (item) {
    IndexController.invalidateLists = true // rerender lists
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
      const task = API.cache['tasks'][taskId]

      if (list.filters && task.filters) {

        // Filter on tags
        const taskTags = task.filters.map(x => x.name)
        const listTags = list.filters.map(x => x.name)
        const matchTags = taskTags.filter(x => listTags.indexOf(x) !== -1)
        let matches = !!matchTags.length || (!taskTags.length && !listTags.length)
        console.log('task matches list tags', task.name, task.filters, list.name, list.filters, matches)

        // Filter on status
        if (matches && list.data.statuses) {
          matches = list.data.statuses.indexOf(task.status) !== -1
          console.log('task matches list statuses', task.name, task.status, list.name, list.statuses, matches)
        }

        if (matches) {
          tasks.push(task)
        }
      }
    }

    return tasks
  },

  loadListTasks (list) {
    if (list._tasksLoaded) {
      console.log('tasks already loaded', list) // params
      return
    }

    // Set the internal `_tasksLoaded` flag.
    // Tasks won't be reloaded until this is set to false
    list._tasksLoaded = true

    // let name, tags, params, request, requests = []
    const name = window.tommy.config.getCurrentUserName()
    const tags = [ name ]
    if (list.data && list.filters) {
      for (let i = 0; i < list.filters.length; i++) {
        tags.push(list.filters[i].name)
      }
    }

    const params = {
      addon: 'tasks',
      kind: 'Task',
      tags: tags,
      with_filters: true,
      with_permission_to: true
    }
    if (list.data.date_range) {
      params.date_range = list.data.date_range;
    }
    if (list.data.statuses)
      params.status = list.data.statuses

    return window.tommy.api.getFragments(params)
  },

  loadTasks () {
    console.log('load tasks')

    const requests = []
    for (const listId in API.cache['lists']) {
      const list = API.cache['lists'][listId]
      const request = API.loadListTasks(list)
      if (request)
        requests.push(request)
    }

    return Promise.all(requests).then(API.addTasks)
  },

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

    IndexController.invalidateLists = true // rerender lists

    task.addon = 'tasks'
    task.kind = 'Task'
    task.with_filters = true
    task.with_permission_to = true
    if (!task.id) { API.addTaskActivity(task, 'status', window.tommy.i18n.t('task.created_a_task')) }
    if (!task.status) { task.status = API.STATUSES[0] }
    if (!task.start_at) { task.start_at = (new Date).getTime() }

    // Specify the access permissions this resource will belong to
    if (!task.id) {
      task.with_permissions = [ 'task_create_access', 'task_edit_access' ]
      const actor = window.tommy.addons.getCurrentActor()
      if (actor) {
        if (!task.filters) task.filters = [];
        task.filters.push({
          context: 'members',
          name: `${actor.first_name} ${actor.last_name}`,
          user_id: actor.user_id
        })
      }
    }

    const params = Object.assign({}, task, { data: JSON.stringify(task.data) })
    if (task.id) {
      return window.tommy.api.updateFragment(task.id, params).then(API.addTask)
    } else {
      return window.tommy.api.createFragment(params).then(API.addTask)
    }
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
      kind: 'TaskList',
      with_filters: true,
      with_permission_to: true
    }, params)
    return window.tommy.api.getFragments(params).then(API.addLists)
  },

  deleteList (listId) {
    IndexController.invalidateLists = true
    delete API.cache['lists'][listId]
    console.log('delete list', listId)
    return window.tommy.api.deleteFragment(listId)
  },

  saveList (list) {
    console.log('save list', list)

    // Set the internal flags to reload tasks for this list
    API.tasksLoaded = false
    list._tasksLoaded = false
    IndexController.invalidateLists = true // rerender lists

    list.addon = 'tasks'
    list.kind = 'TaskList'
    list.with_filters = true
    list.with_permission_to = true
    if (!list.data) { list.data = {} }
    if (typeof (list.data.position) === 'undefined') { list.data.position = Object.keys(API.cache['lists']).length }
    if (typeof (list.data.active) === 'undefined') { list.data.active = true }
    if (typeof (list.data.show_fast_add) === 'undefined') { list.data.show_fast_add = true }

    // Specify the access permissions this resource will belong to
    if (!list.id)
      list.with_permissions = [ 'task_list_read_access', 'task_list_edit_access' ]

    const params = Object.assign({}, list, {
      data: JSON.stringify(list.data),
      filters: JSON.stringify(list.filters)
    })
    if (list.id) {
      return window.tommy.api.updateFragment(list.id, params).then(API.addList)
    }
    else {
      return window.tommy.api.createFragment(params).then(API.addList)
    }
  },

  currentUserTag () {
    return {
      context: 'members',
      name: window.tommy.config.getCurrentUserName(),
      user_id: window.tommy.config.getCurrentUserId()
    }
  },

  createDefaultList () {
    console.log('creating deafult task list')
    let list = {
      name: window.tommy.i18n.t('index.default-task-name'),
      data: {
        default: true
      },

      // Default list filters show tasks tagged with current user
      filters: [ API.currentUserTag() ]
    }
    return API.saveList(list)
  },

  hasDefaultList () {
    return API.cache['lists'] && Object.values(API.cache['lists']).filter(x => x.data.default).length > 0
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

  initPermissionSelect (page, name, resource_id) {
    console.log('init permission selects', name, resource_id)
    const params = {
      resource_id: resource_id,
      with_filters: true
    }
    window.tommy.api.getInstalledAddonPermission('tasks', name, params).then(permission => {
      console.log('installed addon permission', permission)
      // for (var i = 0; i < permissions.length; i++) {
        // const wantedPermission = wantedPermissions.filter(x => x.name == permissions[i].name)[0]
        // if (!wantedPermission) continue
        // const permission = Object.assign({}, permissions[i], wantedPermission)
        // console.log('init permissions', permission)
      permission.resource_id = resource_id
      window.tommy.tplManager.appendInline('tasks__tagSelectTemplate', permission, page.container)
      API.initTagSelect(page, permission)
      // }
    })
  },

  initTagSelect (page, permission) {
    const $tagSelect = $$(page.container).find('.tag-select[data-permission-name="' + permission.name + '"]') //.find('') //$page.find('#addon-permissions-form .tag-select')
    console.log('init tag select', permission, $tagSelect.dataset())
    window.tommy.tagSelect.initWidget($tagSelect, permission.filters, function(data) {
      console.log('save permission tags', permission, data)
      window.tommy.api.updateInstalledAddonPermission('tasks', permission.name, {
        resource_id: permission.resource_id, // pass the resource_id for resource specific permissions
        with_filters: true,
        filters: JSON.stringify(data) // data
      })
    })
  },

  isTablet () {
    return window.innerWidth >= 630
  },

  STATUSES: [ 'Unassigned', 'Assigned', 'Processing', 'Completed', 'Closed', 'Archive Task', 'Cancel' ],

  translateStatus (status) {
    if (status)
      return window.tommy.i18n.t('status.' + window.tommy.util.underscore(status), { defaultValue: status })
  },

  untranslateStatus (translatedStatus) {
    for (let i = 0; i < API.STATUSES.length; i++) {
      if (API.translateStatus(API.STATUSES[i]) === translatedStatus)
        return API.STATUSES[i]
    }
  },

  translatedStatuses () {
    const statuses = []
    for (let i = 0; i < API.STATUSES.length; i++) {
      statuses.push(API.translateStatus(API.STATUSES[i]))
    }
    return statuses
  }
}

export default API
