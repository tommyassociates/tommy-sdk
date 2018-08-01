const tommy = window.tommy;
const api = tommy.api;

const API = {
  cache: {
    services: [],
    coupons: [],
    locations: [],
    booking: {},
  },
  getServiceList(categoryId) {
    return api.call({
      endpoint: `vendors/${tommy.config.getCurrentTeamId()}/products`,
      method: 'GET',
      data: {}
    }).then((data) => {
      API.cache.services = data;
      return data;
    });
  },
  getServiceDetails(id) {
    return api.call({
      endpoint: `vendors/${tommy.config.getCurrentTeamId()}/products/${id}`,
      method: 'GET',
    }).then((data) => {
      return data;
    });
  },
  getCouponList(categoryId) {
    return api.call({
      endpoint: `vendors/${tommy.config.getCurrentTeamId()}/coupons`,
      method: 'GET',
      data: {}
    }).then((data) => {
      API.cache.coupons = data;
      return data;
    });
  },
  getLocations() {
    return api.call({
      endpoint: 'addons/nurse_booking/install/settings/locations',
      method: 'GET',
    }).then((res) => {
      API.cache.locations = res && res.data && res.data.locations ? res.data.locations : [];
      return API.cache.locations;
    });
  },
  saveLocations(locations) {
    if (!locations) {
      locations = API.cache.locations;
    } else {
      API.cache.locations = locations;
    }
    return api.call({
      endpoint: 'addons/nurse_booking/install/settings/locations',
      method: 'PUT',
      data: {data: JSON.stringify({locations})},
    }).then((res) => {
      return res.data.locations;
    });
  },
  addLocation(location) {
    if (location.default) {
      API.cache.locations.forEach((loc) => {
        loc.default = false;
      });
      API.cache.locations.unshift(location);
    } else {
      API.cache.locations.push(location);
    }
    return API.saveLocations(API.cache.locations);
  },
  removeLocation(index) {
    API.cache.locations.splice(index, 1);
    return API.saveLocations(API.cache.locations);
  },
  sendOrder(data) {
    return api.call({
      endpoint: `vendors/${tommy.config.getCurrentTeamId()}/orders`,
      method: 'POST',
      data,
    });
  },
  getOrdersHistory() {
    return api.call({
      endpoint: `vendors/${tommy.config.getCurrentTeamId()}/orders/`,
      method: 'GET',
    }).then((data) => {
      API.cache.orders = data;
      return data;
    });
  },
  getOrderDetails(id) {
    return api.call({
      endpoint: `vendors/${tommy.config.getCurrentTeamId()}/orders/${id}?with_wallet_transaction=true `,
      method: 'GET',
    }).then((data) => {
      return data;
    });
  }
}

export default API
