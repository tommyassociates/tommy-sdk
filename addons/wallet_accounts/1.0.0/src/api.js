const tommy = window.tommy;
const api = tommy.api;

const API = {
  actor: undefined,
  actorId: undefined,
  getOrderedLists() {
    if (!API.cache.lists) return [];
    const lists = Object.values(API.cache.lists);
    if (!lists.length) return [];
    return lists.sort((a, b) => {
      return a.data.position - b.data.position; // ascending order
    });
  },

  addTransaction(item) {
    IndexController.invalidateLists = true; // rerender lists
    API.cache.transactions[item.id] = item;
    console.log('transaction added', item);
  },

  addTransactions(items) {
    if (items && items.length) {
      for (let i = 0; i < items.length; i += 1) {
        if (Array.isArray(items[i])) { API.addTransactions(items[i]); } else { API.addTransaction(items[i]); }
      }
    }
  },

  getListTransactions(listId) {
    const list = API.cache.lists[listId];
    return list.transactions;
  },

  loadListTransactions(list, tags = []) {
    if (list.data && list.filters) {
      for (let i = 0; i < list.filters.length; i += 1) {
        tags.push(list.filters[i].name);
      }
    }

    const params = {
      tags,
      with_filters: true,
      with_permission_to: true,
    };
    if (list.data.date_range) {
      params.date_range = list.data.date_range;
    }
    if (list.data.amount_min) {
      params.amount_min = list.data.amount_min;
    }
    if (list.data.amount_max) {
      params.amount_max = list.data.amount_max;
    }
    if (list.data.statuses) {
      params.status = list.data.statuses;
    }
    if (API.actorId || list.actorId) {
      params.executor_id = API.actorId || list.actorId;
    }

    return api.call({
      endpoint: 'wallet/manager/transactions',
      data: params,
    });
  },

  loadTransactions() {
    console.log('load transactions');

    const requests = [];
    for (const listId in API.cache.lists) {
      const list = API.cache.lists[listId];
      const request = API.loadListTransactions(list);
      if (request) { requests.push(request); }
    }

    return Promise.all(requests).then(API.addTasks);
  },

  saveTransaction(transaction) {
    return api.call({
      endpoint: 'wallet/manager/transactions',
      method: 'POST',
      data: transaction,
    });
  },

  addList(item) {
    API.cache.lists[item.id] = item;
    console.log('added transaction list', item);
  },

  addLists(items) {
    API.listsLoaded = true;
    if (items && items.length) {
      for (let i = 0; i < items.length; i += 1) {
        API.addList(items[i]);
      }
    }
  },

  loadLists(params = {}) {
    if (API.actorId) {
      return new Promise((resolve) => {
        resolve([
          {
            actorId: API.actorId,
            data: {
              active: true,
              default: true,
              position: 0,
              statuses: [],
            },
            id: `actor-${API.actorId}`,
            kind: 'TransactionList',
            name: 'Transactions',
            permission_to: ['create', 'read', 'update', 'delete'],
          },
        ]);
      });
    }
    return api.getFragments(Object.assign({
      addon: 'wallet_accounts',
      kind: 'TransactionList',
      with_filters: true,
      with_permission_to: true,
    }, params));
  },

  deleteList(listId) {
    IndexController.invalidateLists = true;
    delete API.cache.lists[listId];
    console.log('delete list', listId);
    return api.deleteFragment(listId);
  },

  saveList(list) {
    list.addon = 'wallet_accounts';
    list.kind = 'TransactionList';
    list.with_filters = true;
    list.with_permission_to = true;
    if (!list.data) { list.data = {}; }
    if (typeof (list.data.position) === 'undefined') { list.data.position = 0; }
    if (typeof (list.data.active) === 'undefined') { list.data.active = true; }

    // Specify the access permissions this resource will belong to
    if (!list.id) {
      list.with_permissions = [
        'wallet_accounts_transaction_list_read_access', 'wallet_accounts_transaction_list_edit_access',
      ];
    }

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
      name: tommy.i18n.t('wallet_accounts.index.default-list-name'),
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

  hasDefaultList() {
    return API.cache.lists && Object.values(API.cache.lists).filter(x => x.data.default).length > 0;
  },

  initPermissionSelect(page, name, resource_id) {
    console.log('init permission selects', name, resource_id);
    const params = {
      resource_id,
      with_filters: true,
    };
    api.getInstalledAddonPermission('wallet_accounts', name, params).then((permission) => {
      console.log('installed addon permission', permission);
      // for (var i = 0; i < permissions.length; i += 1) {
      // const wantedPermission = wantedPermissions.filter(x => x.name == permissions[i].name)[0]
      // if (!wantedPermission) continue
      // const permission = Object.assign({}, permissions[i], wantedPermission)
      // console.log('init permissions', permission)
      permission.resource_id = resource_id;
      window.tommy.tplManager.appendInline('wallet_accounts__tagSelectTemplate', permission, page.container);
      API.initTagSelect(page, permission);
      // }
    });
  },

  initTagSelect(page, permission) {
    const $tagSelect = $$(page.container).find(`.tag-select[data-permission-name="${permission.name}"]`); // .find('') //$page.find('#addon-permissions-form .tag-select')
    console.log('init tag select', permission, $tagSelect.dataset());
    window.tommy.tagSelect.initWidget($tagSelect, permission.filters, (data) => {
      console.log('save permission tags', permission, data);
      api.updateInstalledAddonPermission('wallet_accounts', permission.name, {
        resource_id: permission.resource_id, // pass the resource_id for resource specific permissions
        with_filters: true,
        filters: JSON.stringify(data), // data
      });
    });
  },

  isTablet() {
    return window.innerWidth >= 630;
  },

  STATUSES: ['failed', 'paid'],

  translateStatus(status) {
    if (status) { return window.tommy.i18n.t(`transaction_status.${window.tommy.util.underscore(status)}`, { defaultValue: status }); }
  },
  getCards() {
    return api.call({
      endpoint: 'wallet/manager/cards?with_holder=true',
    });
  },
  getActorCard() {
    return api.call({
      endpoint: 'wallet/manager/cards?with_holder=true',
    }).then((cards) => {
      let actorCard;
      cards.forEach((card) => {
        if (card && card.holder && (parseInt(card.holder.id, 10) === parseInt(API.actorId, 10))) {
          actorCard = card;
        }
      });
      return actorCard;
    });
  },
  saveBalance(id, balance, credit_limit) {
    return api.call({
      endpoint: `wallet/manager/cards/${id}`,
      method: 'PUT',
      data: {
        balance,
        credit_limit,
      },
    }).then((cards) => {
      return cards[0];
    });
  },
};

export default API;
