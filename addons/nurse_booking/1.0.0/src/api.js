const tommy = window.tommy;
const api = tommy.api;

const API = {
  cache: {
    services: [],
    coupons: [],
    locations: [],
    booking: {},
    nurse: {},
  },
  getServiceList(teamId) {
    return Promise.all([
      api.call({
        endpoint: `vendors/${teamId}/products`,
        method: 'GET',
        data: {},
      }),
      api.call({
        endpoint: `vendors/${teamId}/packages`,
        method: 'GET',
        data: {},
      }),
    ]).then(([products, packages]) => {
      const services = [...products, ...packages].filter(s => s.active);
      API.cache.services = services;
      return services;
    });
  },
  getServiceDetails(teamId, id, type) {
    return api.call({
      endpoint: `vendors/${teamId}/${type === 'VendorProduct' ? 'products' : 'packages'}/${id}`,
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
      cache: false,
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
  getNurseList(teamId, startTime, endTime) {
    return api.call({
      endpoint: `teams/${teamId}/members`,
      method: 'GET',
      data: {
        tags: ['Employee'],
        is_available_between: [new Date(startTime).toJSON(), new Date(endTime).toJSON()],
      },
      cache: false,
    }).then((res) => {
      API.cache.nurses = (res || []).filter(n => n.is_available === true);
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
    let date = order.data.date;
    if (typeof date === 'string') date = parseInt(date, 10);
    let end_at;
    if (order.data.duration && order.data.duration > 0)  {
      end_at = date + parseInt(order.data.duration, 10) * 60 * 1000;
    }
    return api.createEvent({
      addon: 'nurse_booking',
      title: order.name,
      start_at: new Date(date).toJSON(),
      end_at: new Date(end_at).toJSON(),
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
      addon: 'nurse_booking',
      kind: 'Booking',
      resource_id: orderId,
      resource_type: 'VendorOrder',
    }).then((events) => {
      return Promise.all(events.map(event => api.deleteEvent(event.id)));
    });
  },
  setAvailabilityLock(order) {
    const nurseId = order.data.nurse.user_id;
    let date = new Date(order.data.date);
    const hours = date.getHours();
    date.setHours(0, 0, 0, 0);
    date = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
    const minusDay = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    const plusDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    return api.call({
      endpoint: 'fragments?addon=availability&kind=Availability',
      data: {
        user_id: nurseId,
        date_range: [minusDay.toJSON(), plusDay.toJSON()],
      },
    }).then((fragments) => {
      let fragment;
      fragments.forEach((f) => {
        if (new Date(f.start_at).toJSON() === date.toJSON()) {
          fragment = f;
        }
      });
      const lockData = {};
      if (hours >= 7 && hours < 13) {
        lockData.lock_am = true;
      } else if (hours >= 13 && hours < 22) {
        lockData.lock_pm = true;
      } else {
        lockData.lock_nd = true;
      }
      if (fragment) {
        Object.assign(fragment.data, lockData);
        return api.updateFragment(fragment.id, fragment);
      }
      return api.createFragment({
        addon: 'availability',
        kind: 'Availability',
        data: JSON.stringify({
          ...lockData,
        }),
        start_at: date.toJSON(),
        user_id: nurseId,
      });
    });
  },
  deleteAvailabilityLock(order) {
    const nurseId = order.data.nurse.user_id;
    let date = new Date(parseInt(order.data.date, 10));
    const hours = date.getHours();
    date.setHours(0, 0, 0, 0);
    date = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
    const minusDay = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    const plusDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    return api.call({
      endpoint: 'fragments?addon=availability&kind=Availability',
      data: {
        user_id: nurseId,
        date_range: [minusDay.toJSON(), plusDay.toJSON()],
      },
    }).then((fragments) => {
      let fragment;
      fragments.forEach((f) => {
        if (new Date(f.start_at).toJSON() === date.toJSON()) {
          fragment = f;
        }
      });
      let keyToRemove;
      if (hours >= 7 && hours < 13) {
        keyToRemove = 'lock_am';
      } else if (hours >= 13 && hours < 22) {
        keyToRemove = 'lock_pm';
      } else {
        keyToRemove = 'lock_nd';
      }
      if (fragment && fragment.data && fragment.data[keyToRemove]) {
        delete fragment.data[keyToRemove];
        return api.updateFragment(fragment.id, fragment);
      }
      return Promise.resolve('nothing-to-remove');
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
      endpoint: `vendors/${teamId}/orders/${data.id}`,
      method: 'PUT',
      data,
    });
  },
  getOrdersHistory(teamId) {
    return api.call({
      endpoint: `vendors/${teamId}/orders/`,
      method: 'GET',
      cache: false,
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
  cancelOrder(teamId, id, transactionId, order) {
    return api.call({
      endpoint: `vendors/${teamId}/orders/${id}`,
      method: 'DELETE',
    }).then(() => {
      return Promise.all([
        API.deleteBookingEvent(id),
        api.call({
          endpoint: `/wallet/transactions/${transactionId}/refund`,
          method: 'POST',
        }),
      ]);
    });
  },
};

export default API;
