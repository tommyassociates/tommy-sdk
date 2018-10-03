import API from '../api'

const CardDetailsController = {
  init (page) {
    const { id, name } = page.query;
    if (name) {
      $$(page.navbarInnerContainer).find('.center').text(name);
    }
    API.getWalletTransactions(id).then((items) => {
      window.tommy.tplManager.renderInline('wallet__transactionsListTemplate', { items }, page.container);
    });
  },
  uninit () {},
};

export default CardDetailsController
