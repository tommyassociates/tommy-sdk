import API from '../api'

const TransactionDetailsController = {
  init (page) {
    const { id } = page.query;
    const transaction = API.cache.transactions[id];
    window.tommy.tplManager.renderInline('wallet_accounts__transactionDetailsTemplate', transaction, page.container);
  },
  uninit () {},
};

export default TransactionDetailsController
