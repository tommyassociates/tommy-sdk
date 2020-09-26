const tommy = window.tommy;
const api = tommy.api;

const API = {
  getBillingInfo(data = {}) {
    return api.call({
      endpoint: 'account/billing',
      method: 'GET',
      data
    });
  },

  updateBillingInfo(data = {}) {
    return api.call({
      endpoint: 'account/billing',
      method: 'PUT',
      data
    });
  },

  getPayments(data = {}) {
    return api.call({
      endpoint: 'account/payments',
      method: 'GET',
      data
    });
  },

  downloadInvoice(id) {
    return api.call({
      endpoint: `account/payments/${id}/invoice`,
      // method: 'GET',
      // data
    });
  },


};

export default API;
