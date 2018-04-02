import API from '../api'

const BoardSettingsController = {
  init (page) {
    const $page = $$(page.container)
    const $nav = $$(page.navbarInnerContainer)

    window.tommy.tplManager.renderInline('tasks__boardSettingTemplate', null, $page)

    API.initPermissionSelects(page, ['task_create_access', 'task_edit_access'])

    $nav.find('a.save').on('click', ev => {
      const data = window.tommy.app.f7.formToJSON($page.find('form'))

      // NOTE: Form not implemented yet
      ev.preventDefault()
    })
  },

  saveList () {
  },

  afterSave (res) {
    // console.log('board saved', res)
    // window.tommy.app.f7view.router.back()
  }
}

export default BoardSettingsController
