import API from '../api'

const BoardSettingsController = {
  init (page) {
    const $page = $$(page.container)
    const $nav = $$(page.navbarInnerContainer)

    window.tommy.tplManager.renderInline('tasks__boardSettingTemplate', null, $page)

    $nav.find('a.save').on('click', ev => {
      const data = window.tommy.app.f7.formToJSON($page.find('form'))
      alert('implement me')
      ev.preventDefault()
    })
  },

  saveList () {
  },

  afterSave (res) {
    // console.log('list saved', res)
    // API.addList(res)
    // window.tommy.app.f7view.router.back()
  }
}

export default BoardSettingsController
