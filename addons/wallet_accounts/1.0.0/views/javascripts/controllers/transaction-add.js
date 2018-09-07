import API from '../api'

const TransactionAddController = {
  init (page) {
    const $page = $$(page.container)
    const $nav = $$(page.navbarInnerContainer)
    TransactionAddController.$page = $page;
    TransactionAddController.$nav = $nav;
    TransactionAddController.bind($page);
    API.getCards().then(TransactionAddController.renderCards)
  },
  bind($page) {
    TransactionAddController.$nav.find('a.save').on('click', ev => {
      const data = window.tommy.app.f7.formToJSON($page.find('form'))
      ev.preventDefault()
      // data.filters = [ API.currentUserTag() ] // tag the current user
      TransactionAddController.saveTransaction(data)
    });
  },
  renderCards(cards) {
    const cardsHtml = `
      <li>
        <a href="#" class="smart-select item-link item-content" data-searchbar="true">
          <select name="wallet_card_id">${cards.map((card, index) => `
            <option data-option-class="wallet_accounts_smart-select-option" data-option-image="${card.holder.icon_url}" value="${card.id}">${card.holder.first_name || ''} ${card.holder.last_name || ''}</option>
          `)}</select>
          <div class="item-inner">
            <div class="item-title">${window.tommy.i18n.t('transaction-add.wallet_account_placeholder')}</div>
            <div class="item-after">${cards[0] ? `${cards[0].holder.first_name || ''} ${cards[0].holder.last_name || ''}` : ''}</div>
          </div>
        </a>
      </li>
    `.trim();
    TransactionAddController.$page.find('ul').append(cardsHtml);
  },
  saveTransaction(data) {
    const { amount, wallet_card_id, payee } = data;
    API
      .saveTransaction({
        amount,
        wallet_card_id,
        payee,
        status: 'paid',
        addon: 'wallet_accounts',
        addon_id: undefined,
        addon_install_id: undefined,
      })
      .then(TransactionAddController.afterSave)
  },
  afterSave (res) {
    console.log('transaction saved', res)
    window.tommy.app.f7view.router.back()
  }
}

export default TransactionAddController
