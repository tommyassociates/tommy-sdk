const api = window.tommy.api;

const API = {
  getRecords(addon, vitalsElement, user, { page, limit, dateFrom, dateTo } = {}) {
    // eslint-disable-next-line
    vitalsElement = vitalsElement.split(/[-_]/g).map(w => w[0].toUpperCase() + w.substr(1)).join('');
    let date_range;
    if (dateFrom && dateTo) {
      date_range = [new Date(dateFrom).toJSON(), new Date(dateTo).toJSON()];
    }
    return api.getFragments({
      addon,
      kind: `Vitals${vitalsElement}Item`,
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
  addRecord(addon, vitalsElement, user, data) {
    // eslint-disable-next-line
    vitalsElement = vitalsElement.split(/[-_]/g).map(w => w[0].toUpperCase() + w.substr(1)).join('');
    const startAt = new Date(data.date);
    startAt.setHours(parseInt(data.time.split(':')[0], 10), parseInt(data.time.split(':')[1], 10));
    const obj = {
      addon,
      kind: `Vitals${vitalsElement}Item`,
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
      data: JSON.stringify(data),
    };
    return api.createFragment(obj);
  },
  getSettings(addon) {
    return api.call({
      endpoint: `addons/${addon}/install/settings/addonSettings`,
      method: 'GET',
      cache: false,
    }).then((res) => {
      if (!res) return res;
      if (!res.data) return null;
      return res.data;
    });
  },
  saveSettings(addon, settings = {}) {
    return api.call({
      endpoint: `addons/${addon}/install/settings/addonSettings`,
      method: 'PUT',
      data: { data: JSON.stringify(settings) },
    });
  },
};

export default API;