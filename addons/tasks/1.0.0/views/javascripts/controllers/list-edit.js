import API from '../api'
import IndexController from './index'

const ListEditController = {
  init (page) {
    let list = API.cache['lists'][page.query.list_fragment_id]
    const $page = $$(page.container)
    const $nav = $$(page.navbarInnerContainer)

    console.log('edit list', list)
    window.tommy.tplManager.renderInline('tasks__listEditTemplate', list, $page)

    ListEditController.initListFilters(page, list)
    API.initPermissionSelects(page, ['task_list_read_access', 'task_list_edit_access'])

    $nav.find('a.save').on('click', ev => {
      const data = window.tommy.app.f7.formToJSON($page.find('form'))
      ListEditController.saveList(list, data)
      ev.preventDefault()
    })

    $page.find('.date-range-select').on('click', ev => {
      ListEditController.showDateRangePopup(page, list)
      ev.preventDefault()
    })

    $page.find('.delete-list').on('click', ev => {
      API.deleteList(list.id)
      IndexController.invalidateLists = true
      window.tommy.app.f7view.router.back()
      ev.preventDefault()
    })
  },

  showDateRangePopup (page, list) {
    var html = window.tommy.tplManager.render('tasks__dateRangeSelectTemplate', list.data)
    // let $popup = $$('<div class="popup" data-page="tasks__date-range-select"></div>')
    // $popup.append(html)
    // $popup.append(html)
    // console.log('POPUP', $popup)
    // window.tommy.f7.popup($popup)
    window.tommy.f7.popup(html)
  },

  initListFilters (page, list) {
    // if (!list.filters)
    //     list.filters = []
    let object = {
      title: window.tommy.i18n.t('parmissions.filter_tasks.title'),
      name: 'filter_tasks'
    }
    var $tagSelect = window.tommy.tplManager.appendInline('tasks__tagSelectTemplate', object, page.container)
    console.log('init filter select', list.filters)
    window.tommy.tagSelect.initWidget($tagSelect, list.filters, function(data) {
      console.log('save filter tags', data)
      list.filters = data
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
