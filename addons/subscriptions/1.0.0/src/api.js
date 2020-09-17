const tommy = window.tommy;
const api = tommy.api;

const API = {
  getSubscriptions({cache = false, demoData = false} = {}) {
    if (demoData) {
      return new Promise((resolve, reject) => {
        const data = [
          {
            title: 'one',
            amount_cents: 1000,
            next_payment_due_at: '2020-08-05T08:15:30-05:00',
          },
          {
            title: 'two',
            amount_cents: 4000,
            next_payment_due_at: '2020-08-05T08:15:30-05:00',
          }
        ];
        resolve(data);
      });


    } else {
      const options = {
        cache,
      };
      return api.call(Object.assign({
        endpoint: 'me/subscriptions',
        method: 'GET',
      }, options));
    }
  },

  getBillingInfo({cache = false, demoData = false} = {}) {
    if (demoData) {
      return new Promise((resolve, reject) => {
        const data = {
          // first_name: 'Gavin',
          // last_name: 'Bruce',
          company: 'Tommy',
          country: 'AU',
          address_line1: '113 the panorama',
          address_line2: 'Tallai',
          city: 'Gold Coast',
          postcode: '4213',
          state: 'Queensland',
          company_number: '1234123',
          card_brand: 'Visa',
          card_last4: '1221',
          card_expiry_month: '05',
          card_expiry_year: '2021',
          card_cvc: '123',
        };
        resolve(data);
      });
    } else {
      const options = {
        cache,
      };
      return api.call(Object.assign({
        endpoint: 'me/billing',
        method: 'GET',
      }, options));
    }
  },

  updateBillingInfo({data = {}} = {}) {
    const options = {};
    return api.call(Object.assign({
      endpoint: 'me/billing',
      method: 'PUT',
      data,
    }, options));
  },

  getPayments({cache = false} = {}) {
    const options = {
      cache,
    };
    return api.call(Object.assign({
      endpoint: 'me/payments',
      method: 'GET',
    }, options));
  },
};

export default API;
