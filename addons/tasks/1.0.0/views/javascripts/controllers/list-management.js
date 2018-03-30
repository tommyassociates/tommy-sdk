import TaskAPI from '../api'

//
/// List Management Controller

const ListManagementController = {
  init (page) {
    const $page = $$(page.container)
    const $nav = $$(page.navbarInnerContainer)

        // console.log('edit list', list)
    window.tommy.tplManager.renderInline('tasks__listManagementTemplate', TaskAPI.cache['lists'], $page)

    $nav.find('a.save').on('click', ev => {
      const data = window.tommy.app.f7.formToJSON($page.find('form'))
      ListManagementController.save(page, data)
      ev.preventDefault()
    })
  },

  save (page, data) {
    const $page = $$(page.container)
    let redirected = false

    $page.find('.sortable [data-list-id]').each(function (index) {
      const $this = $$(this)
      const list = TaskAPI.cache['lists'][$this.data('list-id')]
      const active = $this.find('input[type="checkbox"]')[0].checked

      if (list.data.order != index || list.data.active != active) {
        list.data.order = index
        list.data.active = active
        TaskAPI.saveList(list)
        console.log('updated list', list)

        if (!redirected) {
          redirected = true
          window.tommy.app.f7view.router.back()
        }
      }
    })
  }
}

export default ListManagementController
