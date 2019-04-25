const api = window.tommy.api;

const API = {
  actorId: null,
  actor: null,

  takeMedication(user, id, time, taken) {
    const startAt = new Date().toJSON();
    const tagUser = API.actor || user;
    const obj = {
      addon: 'vitals_medication_reminder',
      kind: 'VitalsMedicationReminderTaken',
      with_filters: true,
      start_at: startAt,
      tags: [{
        context: 'members',
        name: `${tagUser.first_name} ${tagUser.last_name}`,
        user_id: user.id,
      }],
      filters: [{
        context: 'members',
        name: `${tagUser.first_name} ${tagUser.last_name}`,
        user_id: tagUser.id,
      }],
      data: JSON.stringify({ medication_id: id, taken, time, date: startAt }),
    };
    if (API.actorId) {
      obj.actor_id = API.actorId;
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
      addon: 'vitals_medication_reminder',
      kind: 'VitalsMedicationReminderTaken',
      with_filters: true,
      with_permission_to: true,
      user_id: API.actorId || user.id,
      actor_id: API.actorId,
      date_range,
    }, {
      cache: false,
    });
  },
  getMedication(user, id) {
    return api.getFragment(id, {
      addon: 'vitals_medication_reminder',
      kind: 'VitalsMedicationReminderMedication',
      with_filters: true,
      with_permission_to: true,
      user_id: API.actorId || user.id,
      actor_id: API.actorId,
    }, {
      cache: false,
    });
  },
  getMedications(user) {
    return api.getFragments({
      addon: 'vitals_medication_reminder',
      kind: 'VitalsMedicationReminderMedication',
      with_filters: true,
      with_permission_to: true,
      user_id: API.actorId || user.id,
      actor_id: API.actorId,
    }, {
      cache: false,
    });
  },
  addMedication(user, data) {
    const tagUser = API.actor || user;
    const obj = {
      addon: 'vitals_medication_reminder',
      kind: 'VitalsMedicationReminderMedication',
      with_filters: true,
      start_at: new Date(data.startDate).toJSON(),
      end_at: new Date(data.endDate).toJSON(),
      tags: [{
        context: 'members',
        name: `${tagUser.first_name} ${tagUser.last_name}`,
        user_id: tagUser.id,
      }],
      filters: [{
        context: 'members',
        name: `${tagUser.first_name} ${tagUser.last_name}`,
        user_id: tagUser.id,
      }],
      data: JSON.stringify(data),
    };
    if (API.actorId) {
      obj.actor_id = API.actorId;
      obj.actor_type = 'User';
    }
    return api.createFragment(obj);
  },
  updateMedication(user, id, data) {
    const tagUser = API.actor || user;
    const startAt = new Date(data.startDate);
    const obj = {
      addon: 'vitals_medication_reminder',
      kind: 'VitalsMedicationReminderMedication',
      with_filters: true,
      start_at: startAt.toJSON(),
      tags: [{
        context: 'members',
        name: `${tagUser.first_name} ${tagUser.last_name}`,
        user_id: tagUser.id,
      }],
      filters: [{
        context: 'members',
        name: `${tagUser.first_name} ${tagUser.last_name}`,
        user_id: tagUser.id,
      }],
      data: JSON.stringify(data),
    };
    if (API.actorId) {
      obj.actor_id = API.actorId;
      obj.actor_type = 'User';
    }
    return api.updateFragment(id, obj);
  },
  deleteMedication(user, id) {
    return api.deleteFragment(id);
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