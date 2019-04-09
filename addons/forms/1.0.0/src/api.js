const tommy = window.tommy;
const api = tommy.api;

const API = {
  cache: {
    templates: null,
  },
  createTemplate(user, data) {
    const obj = {
      addon: 'forms',
      kind: 'FormsTemplate',
      with_filters: true,
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
  getTemplates(user) {
    return api.getFragments({
      addon: 'forms',
      kind: 'FormsTemplate',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
    }, {
      cache: false,
    }).then((data) => {
      API.cache.templates = data;
      return data;
    });
  },
  getTemplate(user, id) {
    return api.getFragment(id, {
      addon: 'forms',
      kind: 'FormsTemplate',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
    }, {
      cache: false,
    });
  },
  updateTemplate(template) {
    template.data = JSON.stringify(template.data);
    return api.updateFragment(template.id, template);
  },
  deleteTemplate(id) {
    return api.deleteFragment(id);
  },
  createAssignment(user, data) {
    const obj = {
      addon: 'forms',
      kind: 'FormsAssignment',
      with_filters: true,
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
      data: JSON.stringify(Object.assign({ enabled: true, anonymous: false }, data)),
    };
    return api.createFragment(obj);
  },
  getAssignments(user) {
    return api.getFragments({
      addon: 'forms',
      kind: 'FormsAssignment',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
    }, {
      cache: false,
    }).then((data) => {
      API.cache.assignments = data;
      return data;
    });
  },
  getAssignment(user, id) {
    return api.getFragment(id, {
      addon: 'forms',
      kind: 'FormsAssignment',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
    }, {
      cache: false,
    });
  },
  updateAssignment(assignment) {
    assignment.data = JSON.stringify(assignment.data);
    return api.updateFragment(assignment.id, assignment);
  },
  deleteAssignment(id) {
    return api.deleteFragment(id);
  },

  // Shortcuts
  createShortcut(user, data) {
    const obj = {
      addon: 'forms',
      kind: 'FormsShortcut',
      with_filters: true,
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
      data: JSON.stringify(Object.assign({}, data)),
    };
    return api.createFragment(obj);
  },
  getShortcuts(user) {
    return api.getFragments({
      addon: 'forms',
      kind: 'FormsShortcut',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
    }, {
      cache: false,
    }).then((data) => {
      API.cache.assignments = data;
      return data;
    });
  },
  getShortcut(user, id) {
    return api.getFragment(id, {
      addon: 'forms',
      kind: 'FormsShortcut',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
    }, {
      cache: false,
    });
  },
  updateShortcut(shortcut) {
    shortcut.data = JSON.stringify(shortcut.data);
    return api.updateFragment(shortcut.id, shortcut);
  },
  deleteShortcut(id) {
    return api.deleteFragment(id);
  },
};

export default API;
