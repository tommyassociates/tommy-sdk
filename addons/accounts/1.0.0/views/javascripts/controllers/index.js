import API from '../api'
import TransactionController from './transaction'

const IndexController = {
  init (page) {
    console.log('initialize accounts addon')
    if (!API.listsLoaded) { // || !API.transactionsLoaded
      API.initCache()
      API.loadLists().then(() => {
        if (API.hasDefaultList()) {
          IndexController.loadTransactions(page)
        }
        else {

          // Create a default list if none exists
          API.createDefaultList().then(() => {
            IndexController.loadTransactions(page)
          })
        }
      })
    }
    else if(!API.transactionsLoaded) {
      IndexController.loadTransactions(page)
    }
    else {
      IndexController.invalidate(page)
    }

    IndexController.bind(page)
  },

  loadTransactions (page) {
    API.loadTransactions().then(() => {
      IndexController.invalidate(page)
    })
  },

  uninit () {
    console.log('uninitialize accounts addon')
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

      // Inherit list filters from list when quick adding transactions
      data.filters = list.filters

      $$(this).find('input[name="name"]').val('')
      API.saveTransaction(data).then(() => {
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

    $page.on('click', 'a.transaction-card', function () {
      const href = $$(this).data('href')

      // if (API.isTablet()) {
        $$.get(href, function(response) {
          let $popup = $$('<div class="popup" data-page="accounts__transaction" id="accounts__transactions"></div>')
          $popup.append(response)
          $popup.find('.back').removeClass('back')
          $popup.find('.page').addClass('navbar-fixed')
          window.tommy.f7.popup($popup)
          TransactionController.init({
            container: $popup.find('.page')[0],
            navbarInnerContainer: $popup.find('.navbar-inner')[0],
            query: $$.parseUrlQuery(href)
          })

          $popup.on('popup:close', () => {
            IndexController.invalidate(page)
          })

          // window.tommy.f7.initPage($popup.find('.page'))
        })
        // window.tommy.f7view.router.load({url: $$(this).data('href'), animatePages: false})
      // } else {
      //   window.tommy.f7view.router.loadPage($$(this).data('href'))
      // }
    })
  },

  invalidate (page) {
    // if (!IndexController.listsLoaded || !IndexController.transactionsLoaded) return;

    console.log('invalidating accounts index')
    const $page = $$(page.container)
    if (IndexController.invalidateLists || !$page.find('.card').length) {
      console.log('rendering transaction lists')
      IndexController.invalidateLists = false
      window.tommy.tplManager.renderInline('accounts__listsTemplate', API.getOrderedLists(), page.container)

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
      const transactions = API.getListTransactions(listId)
      window.tommy.tplManager.renderTarget('accounts__listTransactionsTemplate', transactions, $e)
    }

    const actor = window.tommy.addons.getCurrentActor()
    if (actor) {
      window.tommy.app.setPageTitle(
        window.tommy.i18n.t('index.title_user', {user: actor.first_name}))
    }
  }
}

export default IndexController
