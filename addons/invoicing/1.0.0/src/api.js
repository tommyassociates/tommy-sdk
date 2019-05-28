const tommy = window.tommy;
const api = tommy.api;

const API = {
  actor: undefined,
  actorId: undefined,
  isNurse: false,
  assignee_id: null,
  contacts: null,
  loadOrder(orderId) {
    const params = {
      with_filters: true,
      with_permission_to: true,
      actor_id: API.actorId,
    };
    return api.call({
      endpoint: `vendor/manager/orders/${orderId}`,
      data: params,
    });
  },
  saveOrder(order) {
    return api.call({
      method: order.id ? 'PUT' : 'POST',
      endpoint: `vendor/manager/orders/${order.id || ''}`,
      data: order,
    });
  },
  loadListOrders(list) {
    const tags = [];
    if (list.data && list.filters) {
      for (let i = 0; i < list.filters.length; i += 1) {
        if (tags.indexOf(list.filters[i].name) < 0) tags.push(list.filters[i].name);
      }
    }
    const params = {
      tags,
      with_filters: true,
      with_permission_to: true,
      actor_id: API.actorId,
      assignee_id: API.assignee_id || undefined,
    };
    if (list.data.date_range) {
      params.date_range = list.data.date_range;
    }
    if (list.data.status) {
      params.status = list.data.status;
    }
    if (list.data.sort) {
      params.sort = list.data.sort;
    }
    if (list.data.price_min) {
      params.price_min = list.data.price_min;
    }
    if (list.data.price_max) {
      params.price_max = list.data.price_max;
    }
    if (list.data.balance_min) {
      params.balance_min = list.data.balance_min;
    }
    if (list.data.balance_max) {
      params.balance_max = list.data.balance_max;
    }
    if (list.data.type === 'invoice') {
      params.invoices = true;
    }
    if (list.data.type === 'quote') {
      params.quotes = true;
    }
    if (list.data.customer) {
      params.user_id = list.data.customer;
    }
    if (API.assignee_id) {
      params.status = ['complete', 'paid'];
    }
    /*
    sort: [price_high, price_low, newest]
    # status: [quote, paid, processing, complete]
    # price_min: integer
    # price_max: integer
    # quotes: boolean
    # invoices: boolean
    # user_id: integer (customer)
    # kind: string
    # tags:object
    # resource_id:integer
    # resource_type:string
    */
    params.data = JSON.stringify(params.data);

    return api.call({
      endpoint: '/vendor/manager/orders',
      data: params,
    });
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
    if (!list.id) { list.with_permissions = ['order_list_read_access', 'order_list_edit_access']; }

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
      name: tommy.i18n.t('invoicing.index.default_list_name'),
      data: {
        default: true,
      },
      filters: [],
    };
    return API.saveList(list);
  },
  loadPromotions() {
    return api.call({
      endpoint: 'vendor/manager/coupons',
      method: 'GET',
      cache: false,
    });
  },
  loadPromotion(itemId) {
    return api.call({
      endpoint: `vendor/manager/coupons/${itemId}`,
      method: 'GET',
      cache: false,
    });
  },
  savePromotion(item) {
    return api.call({
      endpoint: `vendor/manager/coupons/${item.id || ''}`,
      method: item.id ? 'PUT' : 'POST',
      data: item,
      dataType: 'json',
      contentType: 'application/json',
      processData: false,
    });
  },
  loadProducts() {
    return api.call({
      endpoint: 'vendor/manager/products',
      method: 'GET',
      cache: false,
    });
  },
  loadProduct(itemId) {
    return api.call({
      endpoint: `vendor/manager/products/${itemId}`,
      method: 'GET',
      cache: false,
    });
  },
  saveProduct(item, isPackage) {
    const fd = new FormData();
    const data = { ...item };
    if (data.data && typeof data.data === 'object') data.data = { ...data.data };
    Object.keys(data).forEach((key) => {
      let value = data[key];
      if (value === null) value = '';
      if (value === 'null') value = '';
      if ((key === 'data' || key === 'filters' || key === 'vendor_product_ids') && value || Array.isArray(value)) {
        if (typeof value === 'string' && value !== '[object Object]') value = JSON.parse(value);
        if (value === '[object Object]') {
          value = '';
          fd.append(key, value);
          return;
        }
        if (Array.isArray(value) && !value.length) {
          value = null;
          fd.append(key, value);
          return;
        }
        if (!Object.keys(value).length) {
          value = '';
          fd.append(key, value);
        } else {
          value = tommy.app.f7.utils.serializeObject({ [key]: value }).split('&').forEach((group) => {
            fd.append(group.split('=')[0], decodeURIComponent(group.split('=')[1]));
          });
        }
        return;
      }
      if (key === 'image' && !value) {
        value = null;
      }
      if (key === 'image_url' && !value) {
        value = null;
      }
      fd.append(key, value);
    });
    return api.call({
      endpoint: `vendor/manager/${isPackage ? 'packages' : 'products'}/${item.id || ''}`,
      method: item.id ? 'PUT' : 'POST',
      data: fd,
      contentType: 'multipart/form-data',
    });
  },

  loadPackages(params = {}, options = {}) {
    return api.call({
      endpoint: 'vendor/manager/packages',
      method: 'GET',
      cache: false,
    });
  },
  loadPackage(itemId) {
    return api.call({
      endpoint: `vendor/manager/packages/${itemId}`,
      method: 'GET',
      cache: false,
    });
  },
};

export default API;
