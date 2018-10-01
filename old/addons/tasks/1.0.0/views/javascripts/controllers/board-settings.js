import API from '../api'

const BoardSettingsController = {
  init (page) {
    const $page = $$(page.container)
    const $nav = $$(page.navbarInnerContainer)

    window.tommy.tplManager.renderInline('tasks__boardSettingTemplate', null, $page)

    // Team manager only settings
    if (window.tommy.util.isTeamOwnerOrManager()) {
      API.initPermissionSelect(page, 'task_create_access')
      API.initPermissionSelect(page, 'task_edit_access')
    }

    // $nav.find('a.save').on('click', ev => {
    //   const data = window.tommy.app.f7.formToJSON($page.find('form'))
    //
    //   // NOTE: Form not implemented yet
    //   ev.preventDefault()
    // })
  }
}

export default BoardSettingsController
