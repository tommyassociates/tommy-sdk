import API from '../api'

const CardDetailsController = {
  init (page) {
    const { id, name } = page.query;
    if (name) {
      $$(page.navbarInnerContainer).find('.center').text(name);
    }
    API.getWalletTransactions(id).then((data) => {
      window.tommy.tplManager.renderInline('wallet__transactionsListTemplate', { items: data }, page.container);
    });
  },
  uninit () {},
};

export default CardDetailsController
