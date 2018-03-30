import API from '../api'

const ListEditController = {
  init (page) {
    const list = API.cache['lists'][page.query.list_fragment_id]
    const $page = $$(page.container)
    const $nav = $$(page.navbarInnerContainer)

    console.log('edit list', list)
    window.tommy.tplManager.renderInline('tasks__listEditTemplate', list, $page)

    $nav.find('a.save').on('click', ev => {
      const data = window.tommy.app.f7.formToJSON($page.find('form'))
      ListEditController.saveList(list, data)
      ev.preventDefault()
    })

    $page.find('.delete-list').on('click', ev => {
      API.deleteList(list.id)
      IndexController.invalidateLists = true
      window.tommy.app.f7view.router.back()
      ev.preventDefault()
    })
  },

  saveList (list, data) {
    list.name = data.name
    list.data.show_fast_add = !!(data.show_fast_add && data.show_fast_add.length)

    API.saveList(list).then(ListEditController.afterSave)
  },

  afterSave (res) {
    console.log('list saved', res)
    window.tommy.app.f7view.router.back()
  }
}

export default ListEditController
