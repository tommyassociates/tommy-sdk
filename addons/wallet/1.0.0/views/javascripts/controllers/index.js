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
      const showTestButton = window.localStorage.env === 'development';
      window.tommy.tplManager.renderInline(
        'wallet__walletsListTemplate',
        {
          items,
          showTestButton,
        },
        IndexController.page.container
      );
      if (showTestButton) {
        $$('#wallet__createTestTransaction').on('click', () => {
          window.tommy.initWalletTransaction({
            addon_id: 26,
            addon_install_id: 8430,
            payee_name: 'Apple / iMac Pro',
            currency: 'CNY',
            amount: 100,
          });
        })
        $$('#wallet__createTestErrorTransaction').on('click', () => {
          window.tommy.initWalletTransaction({
            addon_id: 26,
            addon_install_id: 8430,
            payee_name: 'Mercedes S600',
            currency: 'USD',
            amount: 100000,
          });
        })
      }
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
