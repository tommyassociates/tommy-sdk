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
};

export default API;
