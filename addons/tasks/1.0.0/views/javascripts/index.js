import IndexController from './controllers/index'
import TaskController from './controllers/task'
import TaskAddController from './controllers/task-add'
import ListAddController from './controllers/list-add'
import ListEditController from './controllers/list-edit'
import ListManagementController from './controllers/list-management'
import BoardSettingController from './controllers/board-setting'

//
// == Router

window.tommy.app.f7.onPageInit('tasks__index', IndexController.init)
window.tommy.app.f7.onPageBack('tasks__index', IndexController.uninit)
window.tommy.app.f7.onPageAfterAnimation('tasks__index', IndexController.invalidate)
window.tommy.app.f7.onPageInit('tasks__board-setting', BoardSettingController.init)
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
