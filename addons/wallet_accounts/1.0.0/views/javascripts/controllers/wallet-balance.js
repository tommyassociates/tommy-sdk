import API from '../api'

const WalletBalanceController = {
  init (page) {
    const $page = $$(page.container)
    const $nav = $$(page.navbarInnerContainer)
    WalletBalanceController.$page = $page;
    WalletBalanceController.$nav = $nav;
    WalletBalanceController.bind($page);
    API.getBalance().then((card) => {
      if (!card) return;
      WalletBalanceController.card = card;
      $page.find('input[name="amount"]').val(card.balance);
    })
  },
  bind($page) {
    WalletBalanceController.$nav.find('a.save').on('click', ev => {
      if (!WalletBalanceController.card) return;
      const data = window.tommy.app.f7.formToJSON($page.find('form'))
      ev.preventDefault()
      WalletBalanceController.saveBalance(data)
    });
  },

  saveBalance(data) {
    if (!WalletBalanceController.card) return;
    const { amount } = data;
    API
      .saveBalance(
        WalletBalanceController.card.id,
        amount
      )
      .then(WalletBalanceController.afterSave)
  },
  afterSave (res) {
    console.log('transaction saved', res)
    window.tommy.app.f7view.router.back()
  }
}

export default WalletBalanceController
