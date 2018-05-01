import API from '../api'

const TaskAddController = {
  init (page) {
    const $page = $$(page.container)
    const $nav = $$(page.navbarInnerContainer)

    window.tommy.tplManager.renderInline('tasks__addTaskTemplate', {}, $page) //API.cache['lists']

    $nav.find('a.save').on('click', ev => {
      const data = window.tommy.app.f7.formToJSON($page.find('form'))
      TaskAddController.saveTask(data)
      ev.preventDefault()
    })
  },

  saveTask (data) {
    API.saveTask(data).then(TaskAddController.afterSave)
  },

  afterSave (res) {
    console.log('task saved', res)
    window.tommy.app.f7view.router.back()
  }
}

export default TaskAddController
