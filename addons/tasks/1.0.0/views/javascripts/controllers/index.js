import API from '../api'
import TaskController from './task'

const IndexController = {
  init (page) {
    console.log('initialize tasks addon')
    if (!API.listsLoaded || !API.tasksLoaded) {
      API.initCache()
      API.loadLists().then(() => {
        if (API.hasLists()) {
          API.loadTasks().then(() => {
            IndexController.invalidate(page)
          })
        }
        else {

          // Create a default list if none exists
          API.createDefaultList().then(() => {
            API.loadTasks().then(() => {
              IndexController.invalidate(page)
            })
          })
        }
      })
    }
    else {
      IndexController.invalidate(page)
    }

    IndexController.bind(page)
  },

  uninit () {
    console.log('uninitialize tasks addon')
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
      const list = API.cache['lists'][$$(this).parents('[data-list-id]').data('list-id')]
      const data = window.tommy.app.f7.formToJSON(this)

      // FIXME: Inherit task filters from list when quick adding tasks
      data.filters = list.filters

      $$(this).find('input[name="name"]').val('')
      API.saveTask(data).then(() => {
        IndexController.invalidate(page)
      })
    })

    // Bind picker actions
    // KLUDGE: This is very hacky and will leave us with unbound events
    $$(document).on('picker:open', (e) => {
      const $this = $$(e.target)

      // Disable the current user from the participant picker,
      // they must always be selected
      if ($this.hasClass('tag-select-picker')) {
        const name = window.tommy.config.getCurrentUserName()
        $this.find(`input[value="${name}"]`).parent().parent().addClass('offscreen')
      }
    })

    $page.on('click', 'a.task-card', function () {
      const href = $$(this).data('href')
      
      if (API.isTablet()) {
        $$.get(href, function(response) {
          let $popup = $$('<div class="popup" data-page="tasks__task" id="tasks__tasks"></div>')
          $popup.append(response)
          $popup.find('.back').removeClass('back')
          $popup.find('.page').addClass('navbar-fixed')
          window.tommy.f7.popup($popup)
          TaskController.init({
            container: $popup.find('.page')[0],
            navbarInnerContainer: $popup.find('.navbar-inner')[0],
            query: $$.parseUrlQuery(href)
          })

          // window.tommy.f7.initPage($popup.find('.page'))
        })
        // window.tommy.f7view.router.load({url: $$(this).data('href'), animatePages: false})
      } else {
        window.tommy.f7view.router.loadPage($$(this).data('href'))
      }
    })
  },

  invalidate (page) {
    // if (!IndexController.listsLoaded || !IndexController.tasksLoaded) return;

    console.log('invalidating tasks index')
    const $page = $$(page.container)
    if (IndexController.invalidateLists || !$page.find('.card').length) {
      IndexController.invalidateLists = false
      window.tommy.tplManager.renderInline('tasks__listsTemplate', API.getOrderedLists(), page.container)

      const swiper = window.tommy.app.f7.swiper('.swiper-container', {
        centeredSlides: !API.isTablet(),
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

    const actor = window.tommy.addons.getCurrentActor()
    if (actor) {
      window.tommy.app.setPageTitle(
        window.tommy.i18n.t('index.title_user', {user: actor.first_name}))
    }
  }
}

export default IndexController
