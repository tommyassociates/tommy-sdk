const tommy = window.tommy;
const api = tommy.api;

const API = {
  actor: undefined,
  actorId: undefined,
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

  saveTransaction(transaction) {
    return api.call({
      endpoint: 'wallet/manager/transactions',
      method: 'POST',
      data: transaction,
    });
  },
  loadTransaction(id) {
    return api.call({
      endpoint: `wallet/manager/transactions/${id}`,
      method: 'GET',
    });
  },

  loadList(listId) {
    return api.getFragment(listId, {
      data: {
        addon: 'wallet_accounts',
        kind: 'TransactionList',
        with_filters: true,
        with_permission_to: true,
      },
    });
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

  createDefaultList(user) {
    const list = {
      name: tommy.i18n.t('wallet_accounts.index.default-list-name'),
      data: {
        default: true,
      },
      filters: [],
    };
    return API.saveList(list);
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
