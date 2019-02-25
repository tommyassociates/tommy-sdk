const api = window.tommy.api;

const API = {
  getRecords(user, { page, limit, dateFrom, dateTo } = {}) {
    let date_range;
    if (dateFrom && dateTo) {
      date_range = [new Date(dateFrom).toJSON(), new Date(dateTo).toJSON()];
    }
    return api.getFragments({
      addon: 'weight',
      kind: 'WeightRecord',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
      page: page || 1,
      limit: limit || 50,
      date_range,
    }, {
      cache: false,
    });
  },
  addRecord({ value, date, time, user, unit }) {
    const startAt = new Date(date);
    startAt.setHours(parseInt(time.split(':')[0], 10), parseInt(time.split(':')[1], 10));
    const obj = {
      addon: 'weight',
      kind: 'WeightRecord',
      with_filters: true,
      start_at: startAt.toJSON(),
      tags: [{
        context: 'members',
        name: `${user.first_name} ${user.last_name}`,
        user_id: user.id,
      }],
      filters: [{
        context: 'members',
        name: `${user.first_name} ${user.last_name}`,
        user_id: user.id,
      }],
      data: JSON.stringify({
        value,
        date,
        time,
        unit,
      }),
    };
    return api.createFragment(obj);
  },
  getSettings() {
    return api.call({
      endpoint: 'addons/weight/install/settings/addonSettings',
      method: 'GET',
      cache: false,
    }).then((res) => {
      if (!res) return res;
      if (!res.data) return null;
      return res.data;
      // API.cache.locations = res && res.data && res.data.locations ? res.data.locations : [];
      // return API.cache.locations;
    });
  },
  saveSettings(settings = {}) {
    return api.call({
      endpoint: 'addons/weight/install/settings/addonSettings',
      method: 'PUT',
      data: { data: JSON.stringify(settings) },
    });
  },
};

export default API;