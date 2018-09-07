import API from '../api'

const IndexController = {
  init (page) {
    console.log('initialize accounts addon')
    window.API = API;
    if (!API.listsLoaded) {
      API.initCache()
      API.loadLists().then(() => {
        if (API.hasDefaultList()) {
          IndexController.invalidate(page)
        }
        else {
          // Create a default list if none exists
          API.createDefaultList().then(() => {
            IndexController.invalidate(page)
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
    console.log('uninitialize accounts addon')
    API.cache = {}
    API.listsLoaded = false;
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
    API.loadTransactions().then(() => {
      console.log('invalidating accounts index')
      const $page = $$(page.container)

      console.log('rendering transaction lists')
      IndexController.invalidateLists = false
      window.tommy.tplManager.renderInline('wallet_accounts__listsTemplate', API.getOrderedLists(), page.container)
      console.log('API.getOrderedLists()', API.getOrderedLists());

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
        console.log('transactions', transactions);
        window.tommy.tplManager.renderTarget('wallet_accounts__listTransactionsTemplate', transactions, $e)
      }
    });
  }
}

export default IndexController
