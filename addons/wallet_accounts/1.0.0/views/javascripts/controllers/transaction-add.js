import API from '../api'

const TransactionAddController = {
  init (page) {
    const $page = $$(page.container)
    const $nav = $$(page.navbarInnerContainer)

    $nav.find('a.save').on('click', ev => {
      const data = window.tommy.app.f7.formToJSON($page.find('form'))
      ev.preventDefault()
      // data.filters = [ API.currentUserTag() ] // tag the current user

      API
        .saveTransaction({
          amount: data.amount,
          status: 'paid',
          addon: 'wallet_accounts',
          addon_id: undefined,
          addon_install_id: undefined,
        })
        .then(TransactionAddController.afterSave)
    })
  },

  afterSave (res) {
    console.log('transaction saved', res)
    window.tommy.app.f7view.router.back()
  }
}

export default TransactionAddController
