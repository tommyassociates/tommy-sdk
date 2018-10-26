const tommy = window.tommy;
const api = tommy.api;

const API = {
  actor: undefined,
  actorId: undefined,
  loadListTasks(list, tags) {
    if (list.data && list.filters) {
      for (let i = 0; i < list.filters.length; i += 1) {
        if (tags.indexOf(list.filters[i].name) < 0) tags.push(list.filters[i].name);
      }
    }

    const params = {
      addon: 'tasks',
      kind: 'Task',
      tags,
      with_filters: true,
      with_permission_to: true,
      actor_id: API.actorId,
    };
    if (list.data.date_range) {
      params.date_range = list.data.date_range;
    }
    if (list.data.statuses) {
      params.status = list.data.statuses;
    }
    params.data = JSON.stringify(params.data);

    return api.getFragments(params);
  },

  addTaskActivity(task, type, text) {
    const currentUser = tommy.root.user;
    const activity = {
      type,
      text,
      time: new Date(),
      user_id: currentUser.id,
      user_name: currentUser.first_name,
    };

    if (!task.data) { task.data = {}; }
    if (!task.data.activity) { task.data.activity = []; }
    task.data.activity.unshift(activity);

    return activity;
  },
  getTask(taskId) {
    return api.getFragment(taskId, {
      data: {
        with_filters: true,
      },
    });
  },

  saveTask(task) {
    task.addon = 'tasks';
    task.kind = 'Task';
    task.with_filters = true;
    task.with_permission_to = true;
    if (!task.start_at) { task.start_at = (new Date()).getTime(); }

    // Specify the access permissions this resource will belong to
    if (!task.id) {
      task.with_permissions = ['task_create_access', 'task_edit_access'];
      const actor = API.actor;
      if (actor) {
        if (!task.filters) task.filters = [];
        task.filters.push({
          context: 'members',
          name: `${actor.first_name} ${actor.last_name}`,
          user_id: actor.user_id,
        });
      }
    }

    const params = Object.assign({}, task, { data: JSON.stringify(task.data) });
    if (task.id) {
      return api.updateFragment(task.id, params);
    }
    return api.createFragment(params);
  },

  getList(listId) {
    return api.getFragment(listId, {
      data: {
        addon: 'tasks',
        kind: 'TaskList',
        with_filters: true,
        with_permission_to: true,
      },
    });
  },

  loadLists(params = {}, options = {}) {
    return api.getFragments(Object.assign({
      addon: 'tasks',
      kind: 'TaskList',
      with_filters: true,
      with_permission_to: true,
      actor_id: API.actorId,
      user_id: API.actorId,
    }, params), options);
  },

  deleteList(listId) {
    return api.deleteFragment(listId);
  },

  saveList(list) {
    list.addon = 'tasks';
    list.kind = 'TaskList';
    list.with_filters = true;
    list.with_permission_to = true;
    if (!list.data) { list.data = {}; }
    if (typeof (list.data.position) === 'undefined') { list.data.position = 0; }
    if (typeof (list.data.active) === 'undefined') { list.data.active = true; }
    if (typeof (list.data.show_fast_add) === 'undefined') { list.data.show_fast_add = true; }
    if (!list.id) { list.with_permissions = ['task_list_read_access', 'task_list_edit_access']; }

    const params = Object.assign({}, list, {
      data: JSON.stringify(list.data),
      filters: JSON.stringify(list.filters),
    });
    if (list.id) {
      return api.updateFragment(list.id, params);
    }
    return api.createFragment(params);
  },

  currentUserTag() {
    return {
      context: 'members',
      name: window.tommy.config.getCurrentUserName(),
      user_id: window.tommy.config.getCurrentUserId(),
    };
  },

  createDefaultList(user) {
    const list = {
      name: tommy.i18n.t('tasks.index.default-list-name'),
      data: {
        default: true,
      },
      filters: [{
        context: 'members',
        name: `${user.first_name} ${user.last_name}`,
        user_id: user.id,
      }],
    };
    return API.saveList(list);
  },
};

export default API;
