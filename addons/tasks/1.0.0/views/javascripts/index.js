import API from './api'
import IndexController from './controllers/index'
import TaskController from './controllers/task'
import TaskAddController from './controllers/task-add'
import ListAddController from './controllers/list-add'
import ListEditController from './controllers/list-edit'
import ListManagementController from './controllers/list-management'
import BoardSettingsController from './controllers/board-settings'

import formatDateRange from './format-date-range';

//
// == Router

window.tommy.app.f7.onPageInit('tasks__index', IndexController.init)
window.tommy.app.f7.onPageBack('tasks__index', IndexController.uninit)
window.tommy.app.f7.onPageAfterAnimation('tasks__index', IndexController.invalidate)
window.tommy.app.f7.onPageInit('tasks__board-settings', BoardSettingsController.init)
window.tommy.app.f7.onPageInit('tasks__list-add', ListAddController.init)
window.tommy.app.f7.onPageInit('tasks__list-edit', ListEditController.init)
window.tommy.app.f7.onPageInit('tasks__list-management', ListManagementController.init)
window.tommy.app.f7.onPageAfterAnimation('tasks__list-management', ListManagementController.init)
window.tommy.app.f7.onPageInit('tasks__task-add', TaskAddController.init)
window.tommy.app.f7.onPageInit('tasks__task', TaskController.init)
window.tommy.app.f7.onPageAfterAnimation('tasks__task', TaskController.invalidate)


//
// == Template7 Helpers

window.tommy.app.t7.registerHelper('tasks__checklistNumCompleted', checklist => {
  let ret = ''
  if (checklist && checklist.items) {
    const completed = checklist.items.filter(value => value.complete)
    ret += completed.length
    ret += '/'
    ret += checklist.items.length
  }
  return ret
})

window.tommy.app.t7.registerHelper('tasks__displayStatus', status => {
  return API.translateStatus(status)
})

window.tommy.app.t7.registerHelper('tasks__displayStatuses', statuses => {
  if (statuses) {
    return statuses.map(x => API.translateStatus(x)).join(', ')
  } else {
    return ''
  }
})

window.tommy.app.t7.registerHelper('tasks__statusSelectOptions', statuses => {
  let ret = ''
  for (let i = 0; i < API.STATUSES.length; i++) {
    const status = API.STATUSES[i]
    const selected = statuses && statuses.indexOf(status) !== -1
    ret += '<option value="' + status + '" ' + (selected ? 'selected' : '') + '>' + (API.translateStatus(status)) + '</option>'
  }
  return ret
})

window.tommy.app.t7.registerHelper('tasks__ifCanEditList', (list, options) => {
    var account = window.tommy.config.getCurrentAccount()

    // BUG: Due to some unknown bug `this` is undefined in this function,
    // so substituting with the `list` variable for return variables
    // console.log('tasks__canEditList', this, list, options)

    // Default lists (the list automatically created for each team member) can
    // only be edited by admins
    if (list.data.default && !window.tommy.util.isTeamOwnerOrManager(account))
      return options.inverse(list, options.data)

    if (list.permission_to.indexOf('update') !== -1)
      return options.fn(list, options.data)
    else
      return options.inverse(list, options.data)
})

window.tommy.app.t7.registerHelper('tasks__displayDateRange', range => {
  return formatDateRange(range);
})
