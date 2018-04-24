import API from '../api'

const IndexController = {
  init (page) {
    if (!API.listsLoaded || !API.tasksLoaded) {
      API.initCache()
      API.loadLists().then(() => {
        if (API.hasLists()) {
          IndexController.invalidate(page)
        }
        else {

          // Create a default list if none exists
          API.createDefaultList().then(() => {
            IndexController.invalidate(page)
          })
        }
      })
      API.loadTasks().then(() => {
        IndexController.invalidate(page)
      })
    }

    // IndexController.invalidate(page)
    IndexController.bind(page)
  },

  uninit () {
    console.log('tasks uninitialize')
    API.cache = {}
  },

  bind (page) {
    const $page = $$(page.container)
    $page.find('.list-content').each(function () {
      const $el = $$(this)
      if ($el[0].scrollHeight >= $el[0].clientHeight) { $el.parent().addClass('hasScroll') }
    })
    $page.on('click', '.fast-add-toggle', function () {
      const $el = $$(this)
      const $panel = $el.closest('.in').removeClass('in').siblings().addClass('in')
      if ($el.data('input-focus')) { $panel.find('input').focus() }
    })
    $page.on('submit', 'form.fast-add-form', function (ev) {
      ev.preventDefault()
      const data = window.tommy.app.f7.formToJSON(this)
      $$(this).find('input[name="name"]').val('')
      API.saveTask(data).then(() => {
        IndexController.invalidate(page)
      })
    })
  },

  invalidate (page) {
    // if (!IndexController.listsLoaded || !IndexController.tasksLoaded) return;

    console.log('invalidating tasks index')
    const $page = $$(page.container)
    if (IndexController.invalidateLists || !$page.find('.card').length) {
      IndexController.invalidateLists = false
      window.tommy.tplManager.renderInline('tasks__listsTemplate', API.cache['lists'], page.container)

      const isTablet = window.innerWidth >= 630
      const swiper = window.tommy.app.f7.swiper('.swiper-container', {
        centeredSlides: !isTablet,
        spaceBetween: 0,
        freeMode: false,
        freeModeSticky: true,
        slidesPerView: 'auto'
      })
    }

    for (const listId in API.cache['lists']) {
      const $e = $$(page.container).find(`[data-list-id="${listId}"] .list-content`)
      const tasks = API.getListTasks(listId)
      window.tommy.tplManager.renderTarget('tasks__listTasksTemplate', tasks, $e)
    }
  }
}

export default IndexController
