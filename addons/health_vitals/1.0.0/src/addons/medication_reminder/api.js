import Actor from '../../actor';

const api = window.tommy.api;

const API = {
  takeMedication(user, id, time, taken) {
    const startAt = new Date().toJSON();
    const tagUser = Actor.user || user;
    const obj = {
      addon: 'health_vitals',
      kind: 'VitalsMedicationReminderTaken',
      with_filters: true,
      start_at: startAt,
      tags: [{
        context: 'members',
        name: tagUser.name || `${tagUser.first_name || ''} ${tagUser.last_name || ''}`,
        user_id: user.id,
      }],
      filters: [{
        context: 'members',
        name: tagUser.name || `${tagUser.first_name || ''} ${tagUser.last_name || ''}`,
        user_id: Actor.id || user.id,
      }],
      data: JSON.stringify({ medication_id: id, taken, time, date: startAt }),
    };
    if (Actor.id) {
      obj.actor_id = Actor.id;
      obj.actor_type = 'User';
    }
    return api.createFragment(obj);
  },
  getTaken(user, { dateFrom, dateTo } = {}) {
    // eslint-disable-next-line
    let date_range;
    if (dateFrom && dateTo) {
      date_range = [new Date(dateFrom).toJSON(), new Date(dateTo).toJSON()];
    }
    return api.getFragments({
      addon: 'health_vitals',
      kind: 'VitalsMedicationReminderTaken',
      with_filters: true,
      with_permission_to: true,
      user_id: Actor.id || user.id,
      actor_id: Actor.id,
      actor_type: Actor.id ? 'User' : undefined,
      date_range,
    }, {
      cache: false,
    });
  },
  getMedication(user, id) {
    return api.getFragment(id, {
      addon: 'health_vitals',
      kind: 'VitalsMedicationReminderMedication',
      with_filters: true,
      with_permission_to: true,
      user_id: Actor.id || user.id,
      actor_id: Actor.id,
      actor_type: Actor.id ? 'User' : undefined,
    }, {
      cache: false,
    });
  },
  getMedications(user) {
    return api.getFragments({
      addon: 'health_vitals',
      kind: 'VitalsMedicationReminderMedication',
      with_filters: true,
      with_permission_to: true,
      user_id: Actor.id || user.id,
      actor_id: Actor.id,
      actor_type: Actor.id ? 'User' : undefined,
    }, {
      cache: false,
    });
  },
  addMedication(user, data) {
    const tagUser = Actor.user || user;
    const obj = {
      addon: 'health_vitals',
      kind: 'VitalsMedicationReminderMedication',
      with_filters: true,
      start_at: new Date(data.startDate).toJSON(),
      end_at: new Date(data.endDate).toJSON(),
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
  updateMedication(user, id, data) {
    const tagUser = Actor.user || user;
    const startAt = new Date(data.startDate);
    const obj = {
      addon: 'health_vitals',
      kind: 'VitalsMedicationReminderMedication',
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
  deleteMedication(user, id) {
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