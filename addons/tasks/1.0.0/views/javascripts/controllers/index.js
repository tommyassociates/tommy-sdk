import TaskAPI from '../api'


const IndexController = {
  init (page) {
    if (!TaskAPI.listsLoaded || !TaskAPI.tasksLoaded) {
      TaskAPI.initCache()
      TaskAPI.loadLists().then(() => {
        IndexController.invalidate(page)
      })
      TaskAPI.loadTasks().then(() => {
        IndexController.invalidate(page)
      })
    }

    // IndexController.invalidate(page)
    IndexController.bind(page)
  },

  uninit () {
    console.log('tasks uninitialize')
    TaskAPI.cache = {}
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
      TaskAPI.saveTask(data).then(() => {
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
      window.tommy.tplManager.renderInline('tasks__listsTemplate', TaskAPI.cache['lists'], page.container)

      const isTablet = window.innerWidth >= 630
      const swiper = window.tommy.app.f7.swiper('.swiper-container', {
        centeredSlides: !isTablet,
        spaceBetween: 0,
        freeMode: false,
        freeModeSticky: true,
        slidesPerView: 'auto'
      })
    }

    for (const listId in TaskAPI.cache['lists']) {
      const $e = $$(page.container).find(`[data-list-id="${listId}"] .list-content`)
      const tasks = TaskAPI.getListTasks(listId)
      window.tommy.tplManager.renderTarget('tasks__listTasksTemplate', tasks, $e)
    }
  }
}

export default IndexController
