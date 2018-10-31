const tommy = window.tommy;
const api = tommy.api;

const API = {
  cache: {
    services: [],
    coupons: [],
    locations: [],
    booking: {},
  },
  getServiceList(teamId) {
    return api.call({
      endpoint: `vendors/${teamId}/products`,
      method: 'GET',
      data: {},
    }).then((data) => {
      API.cache.services = data;
      return data;
    });
  },
  getServiceDetails(teamId, id) {
    return api.call({
      endpoint: `vendors/${teamId}/products/${id}`,
      method: 'GET',
    }).then((data) => {
      return data;
    });
  },
  getCouponList(teamId) {
    return api.call({
      endpoint: `vendors/${teamId}/coupons`,
      method: 'GET',
      data: {},
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
  getNurseList(teamId) {
    return api.call({
      endpoint: `teams/${teamId}/members`,
      method: 'GET',
      data: {
        tags: ['Available For Work'],
      },
    }).then((res) => {
      API.cache.nurses = res;
      return API.cache.nurses;
    });
  },
  saveLocations(locations) {
    if (!locations) {
      // eslint-disable-next-line
      locations = API.cache.locations;
    } else {
      API.cache.locations = locations;
    }
    return api.call({
      endpoint: 'addons/nurse_booking/install/settings/locations',
      method: 'PUT',
      data: { data: JSON.stringify({ locations }) },
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
  createBookingEvent(teamId, order) {
    return api.createEvent({
      title: order.name,
      start_at: new Date(order.data.date).toJSON(),
      location: `${order.data.location.city} ${order.data.location.address}`,
      user_id: order.data.nurse.user_id,
      team_id: teamId,
      kind: 'Booking',
      resource_id: order.id,
      resource_type: 'VendorOrder',
    });
  },
  deleteBookingEvent(orderId) {
    return api.getEvents({
      kind: 'Booking',
      resource_id: orderId,
      resource_type: 'VendorOrder',
    }).then((events) => {
      return Promise.all(events.map(event => api.deleteEvent(event.id)));
    });
  },
  sendOrder(teamId, data) {
    return api.call({
      endpoint: `vendors/${teamId}/orders`,
      method: 'POST',
      data,
    });
  },
  updateOrder(teamId, data) {
    return api.call({
      endpoint: `vendors/${teamId}/orders`,
      method: 'PUT',
      data,
    });
  },
  getOrdersHistory(teamId) {
    return api.call({
      endpoint: `vendors/${teamId}/orders/`,
      method: 'GET',
    }).then((data) => {
      API.cache.orders = data;
      return data;
    });
  },
  getOrderDetails(teamId, id) {
    return api.call({
      endpoint: `vendors/${teamId}/orders/${id}?with_wallet_transaction=true`,
      method: 'GET',
    }).then((data) => {
      return data;
    });
  },
  cancelOrder(teamId, id) {
    return api.call({
      endpoint: `vendors/${teamId}/orders/${id}`,
      method: 'DELETE',
    });
  },
};

export default API;
