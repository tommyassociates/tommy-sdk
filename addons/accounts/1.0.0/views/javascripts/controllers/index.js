import API from '../api'

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
  },

  invalidate (page) {
    // if (!IndexController.listsLoaded || !IndexController.transactionsLoaded) return;

    console.log('invalidating accounts index')
    const $page = $$(page.container)

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

    for (const listId in API.cache['lists']) {
      const $e = $page.find(`[data-list-id="${listId}"] .list-content`)
      const transactions = API.getListTransactions(listId)
      window.tommy.tplManager.renderTarget('accounts__listTransactionsTemplate', transactions, $e)
    }
  }
}

export default IndexController
