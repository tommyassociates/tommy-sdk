import API from '../api'

const IndexController = {
  init (page) {
    console.log('initialize wallet addon')
    IndexController.bind(page);
    IndexController.loadWalletInfo();
    IndexController.loadWallets();
    IndexController.loadTransactions();
    IndexController.loadBalanceHistory();
  },
  loadWalletInfo() {
    API.getWallet().then((data) => {
      if (data.show_balance) {
        $$(IndexController.page.container).find('.wallet-balance-value').text(data.balance);
      }
    });
  },
  loadWallets() {
    API.getWalletCards().then((items) => {
      window.tommy.tplManager.renderInline('wallet__walletsListTemplate', { items }, IndexController.page.container);
    });
  },
  loadTransactions() {
    API.getWalletTransactions().then((items) => {
      window.tommy.tplManager.renderInline('wallet__transactionsListTemplate', { items }, IndexController.page.container);
    });
  },
  loadBalanceHistory() {

  },
  bind (page) {
    IndexController.page = page;
  },
  uninit () {
    IndexController.page = null;
    delete IndexController.page;
    console.log('uninitialize wallet addon')
  },
};

export default IndexController
