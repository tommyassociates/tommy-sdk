const tommy = window.tommy;
const api = tommy.api;

const API = {
  actor: undefined,
  actorId: undefined,
  loadListOrders(list, tags) {
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

  loadList(listId) {
    return api.getFragment(listId, {
      data: {
        addon: 'invoicing',
        kind: 'OrderList',
        with_filters: true,
        with_permission_to: true,
      },
    });
  },

  loadLists(params = {}, options = {}) {
    return api.getFragments(Object.assign({
      addon: 'invoicing',
      kind: 'OrderList',
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
    list.addon = 'invoicing';
    list.kind = 'OrderList';
    list.with_filters = true;
    list.with_permission_to = true;
    if (!list.data) { list.data = {}; }
    if (typeof (list.data.position) === 'undefined') { list.data.position = 0; }
    if (typeof (list.data.active) === 'undefined') { list.data.active = true; }
    if (!list.id) { list.with_permissions = ['invoicing_order_list_read_access', 'invoicing_order_list_edit_access']; }

    const params = Object.assign({}, list, {
      data: JSON.stringify(list.data),
      filters: JSON.stringify(list.filters),
    });
    if (list.id) {
      return api.updateFragment(list.id, params);
    }
    return api.createFragment(params);
  },

  loadItems(params = {}, options = {}) {
    return api.getFragments(Object.assign({
      addon: 'invoicing',
      kind: 'InvoicingItem',
      with_filters: true,
      with_permission_to: true,
      actor_id: API.actorId,
      user_id: API.actorId,
    }, params), options);
  },
  loadPackages(params = {}, options = {}) {
    return api.getFragments(Object.assign({
      addon: 'invoicing',
      kind: 'InvoicingPackage',
      with_filters: true,
      with_permission_to: true,
      actor_id: API.actorId,
      user_id: API.actorId,
    }, params), options);
  },
};

export default API;
