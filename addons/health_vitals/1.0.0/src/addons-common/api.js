import Actor from '../actor';

const api = window.tommy.api;

const API = {
  getRecords(vitalsElement, user, { page, limit, dateFrom, dateTo } = {}) {
    // eslint-disable-next-line
    vitalsElement = vitalsElement.split(/[-_]/g).map(w => w[0].toUpperCase() + w.substr(1)).join('');
    let date_range;
    if (dateFrom && dateTo) {
      date_range = [new Date(dateFrom).toJSON(), new Date(dateTo).toJSON()];
    }
    return api.getFragments({
      addon: 'health_vitals',
      kind: `Vitals${vitalsElement}Item`,
      with_filters: true,
      with_permission_to: true,
      user_id: Actor.id || user.id,
      actor_id: Actor.id,
      actor_type: Actor.id ? 'User' : undefined,
      page: page || 1,
      limit: limit || 50,
      date_range,
    }, {
      cache: false,
    });
  },
  addRecord(vitalsElement, user, data) {
    // eslint-disable-next-line
    vitalsElement = vitalsElement.split(/[-_]/g).map(w => w[0].toUpperCase() + w.substr(1)).join('');
    const startAt = new Date(data.date);
    startAt.setHours(parseInt(data.time.split(':')[0], 10), parseInt(data.time.split(':')[1], 10));
    const tagUser = Actor.user || user;
    const obj = {
      addon: 'health_vitals',
      kind: `Vitals${vitalsElement}Item`,
      with_filters: true,
      start_at: startAt.toJSON(),
      tags: [{
        context: 'members',
        name: tagUser.name || `${tagUser.first_name || ''} ${tagUser.last_name || ''}`,
        user_id: Actor.id || user.id,
      }],
      filters: [{
        context: 'members',
        name: tagUser.name || `${tagUser.first_name || ''} ${tagUser.last_name || ''}`,
        user_id: Actor.id || user.id,
      }],
      data: JSON.stringify(data),
    };
    if (Actor.id) {
      obj.actor_id = Actor.id;
      obj.actor_type = 'User';
    }
    return api.createFragment(obj);
  },
  getSettings(vitalsElement) {
    return api.call({
      endpoint: `addons/health_vitals/install/settings/${vitalsElement}`,
      method: 'GET',
      cache: false,
    }).then((res) => {
      if (!res) return res;
      if (!res.data) return null;
      return res.data;
    });
  },
  saveSettings(vitalsElement, settings = {}) {
    return api.call({
      endpoint: `addons/health_vitals/install/settings/${vitalsElement}`,
      method: 'PUT',
      data: { data: JSON.stringify(settings) },
    });
  },
};

export default API;
