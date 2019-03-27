const api = window.tommy.api;

const API = {
  getVaccine(user, id) {
    return api.getFragment(id, {
      addon: 'vitals_immunisations',
      kind: 'VitalsImmunisationsVaccine',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
    }, {
      cache: false,
    });
  },
  getVaccines(user) {
    return api.getFragments({
      addon: 'vitals_immunisations',
      kind: 'VitalsImmunisationsVaccine',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
    }, {
      cache: false,
    });
  },
  addVaccine(user, data) {
    const obj = {
      addon: 'vitals_immunisations',
      kind: 'VitalsImmunisationsVaccine',
      with_filters: true,
      start_at: new Date(data.scheduledDate).toJSON(),
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
  updateVaccine(user, id, data) {
    const startAt = new Date(data.scheduledDate);
    const obj = {
      addon: 'vitals_immunisations',
      kind: 'VitalsImmunisationsVaccine',
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
    return api.updateFragment(id, obj);
  },
  deleteVaccine(user, id) {
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