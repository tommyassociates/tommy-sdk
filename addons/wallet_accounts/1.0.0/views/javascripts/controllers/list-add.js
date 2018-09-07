import API from '../api'

const ListAddController = {
  init (page) {
    const $page = $$(page.container)
    const $nav = $$(page.navbarInnerContainer)

    $nav.find('a.save').on('click', ev => {
      const data = window.tommy.app.f7.formToJSON($page.find('form'))
      ListAddController.saveList(data)
      ev.preventDefault()
    })
  },

  saveList (data) {
    let list = {}
    list.name = data.name

    // Default list filters show transactions tagged with current user
    list.filters = [ API.currentUserTag() ]

    API.saveList(list).then(ListAddController.afterSave)
  },

  afterSave (res) {
    console.log('list saved', res)
    window.tommy.app.f7view.router.back()
  }
}

export default ListAddController
