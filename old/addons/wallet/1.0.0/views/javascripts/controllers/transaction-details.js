import API from '../api'

const TransactionDetailsController = {
  init (page) {
    const { id } = page.query;
    API.getWalletTransaction(id).then((data) => {
      window.tommy.tplManager.renderInline('wallet__transactionDetailsTemplate', data, page.container);
    });
  },
  uninit () {},
};

export default TransactionDetailsController
