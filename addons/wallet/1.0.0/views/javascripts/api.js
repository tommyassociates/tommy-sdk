import IndexController from './controllers/index'

const api = window.tommy.api;
const API = {
  wallet: {},
  getWallet() {
    return api.call({
      endpoint: 'wallet',
      method: 'GET',
      data: {}
    }).then((data) => {
      API.wallet = data;
      return data;
    })
  },
  updateWalletSettings(data = {}) {
    Object.keys(data).forEach((key) => {
      API.wallet[key] = data[key];
    });
    return api.call({
      endpoint: 'wallet',
      method: 'PUT',
      data,
    });
  },
  getWalletCards() {
    return api.call({
      endpoint: 'wallet/cards',
      method: 'GET',
      data: {}
    })
  },
  getWalletTransactions(cardId) {
    return api.call({
      endpoint: 'wallet/transactions',
      method: 'GET',
      data: {
        card_id: cardId,
      }
    });
  },
  getWalletTransaction(transactionId) {
    return api.call({
      endpoint: `wallet/transactions/${transactionId}`,
      method: 'GET',
      data: {}
    });
  },
  getBalanceHistory() {

  },
  createWalletTransaction(data = {}) {
    return api.call({
      endpoint: 'wallet/transactions',
      method: 'POST',
      data,
    });
  },
}

export default API
