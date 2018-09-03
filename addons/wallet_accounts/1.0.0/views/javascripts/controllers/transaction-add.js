import API from '../api'

const TransactionAddController = {
  init (page) {
    const $page = $$(page.container)
    const $nav = $$(page.navbarInnerContainer)

    window.tommy.tplManager.renderInline('wallet_accounts__addTransactionTemplate', {}, $page) // API.cache['lists']

    $nav.find('a.save').on('click', ev => {
      const data = window.tommy.app.f7.formToJSON($page.find('form'))
      data.filters = [ API.currentUserTag() ] // tag the current user

      TransactionAddController.saveTransaction(data)
      ev.preventDefault()
    })
  },

  saveTransaction (data) {
    API.saveTransaction(data).then(TransactionAddController.afterSave)
  },

  afterSave (res) {
    console.log('transaction saved', res)
    window.tommy.app.f7view.router.back()
  }
}

export default TransactionAddController
