import Actor from '../../actor';

const api = window.tommy.api;

const API = {
  getVaccine(user, id) {
    return api.getFragment(id, {
      addon: 'health_vitals',
      kind: 'VitalsImmunisationsVaccine',
      with_filters: true,
      with_permission_to: true,
      user_id: Actor.id || user.id,
      actor_id: Actor.id,
    }, {
      cache: false,
    });
  },
  getVaccines(user) {
    return api.getFragments({
      addon: 'health_vitals',
      kind: 'VitalsImmunisationsVaccine',
      with_filters: true,
      with_permission_to: true,
      user_id: Actor.id || user.id,
      actor_id: Actor.id,
    }, {
      cache: false,
    });
  },
  addVaccine(user, data) {
    const tagUser = Actor.user || user;
    const obj = {
      addon: 'health_vitals',
      kind: 'VitalsImmunisationsVaccine',
      with_filters: true,
      start_at: new Date(data.scheduledDate).toJSON(),
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
  updateVaccine(user, id, data) {
    const tagUser = Actor.user || user;
    const startAt = new Date(data.scheduledDate);
    const obj = {
      addon: 'health_vitals',
      kind: 'VitalsImmunisationsVaccine',
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
    return api.updateFragment(id, obj);
  },
  deleteVaccine(user, id) {
    return api.deleteFragment(id);
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