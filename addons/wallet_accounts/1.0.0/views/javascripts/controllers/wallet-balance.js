import API from '../api'

const WalletBalanceController = {
  init (page) {
    const $page = $$(page.container)
    const $nav = $$(page.navbarInnerContainer)
    WalletBalanceController.$page = $page;
    WalletBalanceController.$nav = $nav;
    WalletBalanceController.bind($page);
    API.getActorCard().then((card) => {
      if (!card) {
        $page.find('form.list-block').remove();
        $page.find('.page-content').append(`
          <div class="content-block">
            <div class="content-block-inner" style="text-align: center">
              ${window.tommy.i18n.t('wallet-balance.no_wallet_card')}
            </div>
          </div>
        `);
        return;
      }
      WalletBalanceController.card = card;
      $page.find('input[name="balance"]').val(card.balance);
      $page.find('input[name="credit_limit"]').val(card.credit_limit);
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
    const { balance, credit_limit } = data;
    API
      .saveBalance(
        WalletBalanceController.card.id,
        balance,
        credit_limit,
      )
      .then(WalletBalanceController.afterSave)
  },
  afterSave (res) {
    console.log('transaction saved', res)
    window.tommy.app.f7view.router.back()
  }
}

export default WalletBalanceController
