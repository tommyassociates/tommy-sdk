var addon = (function () {
  var tommy = window.tommy;
  var api = tommy.api;

  var API = {
    actor: undefined,
    actorId: undefined,
    isNurse: false,
    assignee_id: null,
    contacts: null,
    loadOrder: function loadOrder(orderId) {
      var params = {
        with_filters: true,
        with_permission_to: true,
        actor_id: API.actorId,
      };
      return api.call({
        endpoint: ("vendor/manager/orders/" + orderId),
        data: params,
      });
    },
    saveOrder: function saveOrder(order) {
      return api.call({
        method: order.id ? 'PUT' : 'POST',
        endpoint: ("vendor/manager/orders/" + (order.id || '')),
        data: order,
      });
    },
    cancelOrder: function cancelOrder(order) {
      return api.call({
        endpoint: ("vendor/manager/orders/" + (order.id)),
        method: 'DELETE',
      });
    },
    loadListOrders: function loadListOrders(list) {
      var tags = [];
      if (list.data && list.filters) {
        for (var i = 0; i < list.filters.length; i += 1) {
          if (tags.indexOf(list.filters[i].name) < 0) { tags.push(list.filters[i].name); }
        }
      }
      var params = {
        tags: tags,
        with_filters: true,
        with_permission_to: true,
        actor_id: API.actorId,
        assignee_id: API.assignee_id || undefined,
      };
      if (list.data.date_range) {
        params.date_range = list.data.date_range;
        if (Array.isArray(params.date_range)) {
          params.date_range = params.date_range.map(function (d) { return d / 1000; });
        }
      }
      if (list.data.status) {
        params.status = list.data.status;
      } else if (API.assignee_id) {
        params.status = ['complete', 'paid', 'processing'];
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
      if (list.data.only_assigned) {
        params.assignee_id = API.actorId || tommy.root.user.id;
      } else if (list.data.assignee) {
        params.assignee_id = list.data.assignee;
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

    loadList: function loadList(listId) {
      return api.getFragment(listId, {
        data: {
          addon: 'invoicing',
          kind: 'OrderList',
          with_filters: true,
          with_permission_to: true,
        },
      });
    },

    loadLists: function loadLists(params, options) {
      if ( params === void 0 ) params = {};
      if ( options === void 0 ) options = {};

      var data = Object.assign({
        addon: 'invoicing',
        kind: 'OrderList',
        with_filters: true,
        with_permission_to: true,
        actor_id: API.actorId,
        user_id: API.actorId,
        only_owned: !API.actorId && !API.isNurse,
      }, params);
      if (!API.actorId && !API.isNurse && typeof data.only_owned === 'undefined') {
        data.only_owned = true;
      }
      return api.getFragments(data, options);
    },

    deleteList: function deleteList(listId, list) {
      return api.deleteFragment(listId, { data: list });
    },

    saveList: function saveList(list) {
      list.addon = 'invoicing';
      list.kind = 'OrderList';
      list.with_filters = true;
      list.with_permission_to = true;
      if (!list.data) { list.data = {}; }
      if (typeof (list.data.position) === 'undefined') { list.data.position = 0; }
      if (typeof (list.data.active) === 'undefined') { list.data.active = true; }
      if (!list.id) { list.with_permissions = ['order_list_read_access', 'order_list_edit_access']; }

      var params = Object.assign({}, list, {
        data: JSON.stringify(list.data),
        filters: JSON.stringify(list.filters),
      });
      if (list.id) {
        return api.updateFragment(list.id, params);
      }
      return api.createFragment(params);
    },
    createDefaultList: function createDefaultList(user) {
      var list = {
        name: tommy.i18n.t('invoicing.index.default_list_name'),
        data: {
          default: true,
        },
        filters: [],
      };
      return API.saveList(list);
    },
    loadPromotions: function loadPromotions() {
      return api.call({
        endpoint: 'vendor/manager/coupons',
        method: 'GET',
        cache: false,
      });
    },
    loadPromotion: function loadPromotion(itemId) {
      return api.call({
        endpoint: ("vendor/manager/coupons/" + itemId),
        method: 'GET',
        cache: false,
      });
    },
    savePromotion: function savePromotion(item) {
      return api.call({
        endpoint: ("vendor/manager/coupons/" + (item.id || '')),
        method: item.id ? 'PUT' : 'POST',
        data: item,
        dataType: 'json',
        contentType: 'application/json',
        processData: false,
      });
    },
    loadProducts: function loadProducts() {
      return api.call({
        endpoint: 'vendor/manager/products',
        method: 'GET',
        cache: false,
      });
    },
    loadProduct: function loadProduct(itemId) {
      return api.call({
        endpoint: ("vendor/manager/products/" + itemId),
        method: 'GET',
        cache: false,
      });
    },
    saveProduct: function saveProduct(item, isPackage) {
      var fd = new FormData();
      var data = Object.assign({}, item);
      if (data.data && typeof data.data === 'object') { data.data = Object.assign({}, data.data); }
      Object.keys(data).forEach(function (key) {
        var obj;

        var value = data[key];
        if (value === null) { value = ''; }
        if (value === 'null') { value = ''; }
        if ((key === 'data' || key === 'filters' || key === 'vendor_product_ids') && value || Array.isArray(value)) {
          if (typeof value === 'string' && value !== '[object Object]') { value = JSON.parse(value); }
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
            value = tommy.app.f7.utils.serializeObject(( obj = {}, obj[key] = value, obj )).split('&').forEach(function (group) {
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
        endpoint: ("vendor/manager/" + (isPackage ? 'packages' : 'products') + "/" + (item.id || '')),
        method: item.id ? 'PUT' : 'POST',
        data: fd,
        contentType: 'multipart/form-data',
      });
    },

    loadPackages: function loadPackages(params, options) {
      if ( params === void 0 ) params = {};
      if ( options === void 0 ) options = {};

      return api.call({
        endpoint: 'vendor/manager/packages',
        method: 'GET',
        cache: false,
      });
    },
    loadPackage: function loadPackage(itemId) {
      return api.call({
        endpoint: ("vendor/manager/packages/" + itemId),
        method: 'GET',
        cache: false,
      });
    },
  };

  function humanTime(date) {
    var moment = window.tommy.moment;
    var localTime = moment.utc(date).toDate();
    if (moment(localTime).isValid()) {
      var now = moment();
      var diff = now.diff(moment(localTime), 'days');
      if (diff === 1) { return ("Yesterday " + (moment(localTime).format('h:mm A'))); }
      if (diff === 0) {
        return ("Today " + (moment(localTime).format('h:mm A')));
      }
      if (diff === -1) {
        return ("Yesterday " + (moment(localTime).format('h:mm A')));
      }
      if (diff >= 1 && diff <= 8 || diff >= -8 && diff <= -1) {
        return moment(localTime).format('ddd h:mm A');
      }
      if (diff >= 365 || diff <= -365) { return moment(localTime).format('MMM D, YYYY h:mm A'); }
      if (diff >= 8 || diff <= -8) { return moment(localTime).format('MMM D h:mm A'); }
    }
    return 'None';
  }

  //

  var script = {
    data: function data() {
      var self = this;
      var account;
      var actorId = self.$f7route.query.actor_id;
      if (actorId) {
        account = self.$root.teamMembers.filter(
          function (user) { return user.user_id === parseInt(self.actorId, 10); }
        )[0];
      } else {
        account = self.$root.account;
      }
      if (!account) {
        account = self.$root.account;
      }
      var roles = account.roles;
      API.isNurse =      !roles
        || (roles && roles.length === 0)
        || (roles
          && (roles.indexOf('Nurse') >= 0 || roles.indexOf('Employee') >= 0));
      API.assignee_id = API.isNurse ? account.user_id : null;
      return {
        lists: null,
        actorId: actorId,
        listWithScroll: {},
        isNurse: API.isNurse,
        contacts: API.contacts,
        orderContacts: {},
        orderContactsLoading: {},
        csvKeys: [],
        csvValues: [],
        promotions: null,
      };
    },
    created: function created() {
      var self = this;
      if (self.actorId) {
        API.actorId = parseInt(self.actorId, 10);
        API.actor = self.actor;
        if (
          API.actor.roles
          && (API.actor.roles.indexOf('Nurse') >= 0
            || API.actor.roles.indexOf('Employee') >= 0)
        ) {
          API.isNurse = true;
          self.isNurse = true;
          API.assignee_id = API.actor.user_id;
        }
      } else {
        delete API.actorId;
        delete API.actor;
      }
    },
    computed: {
      actor: function actor() {
        var self = this;
        if (!self.actorId) { return null; }
        return self.$root.teamMembers.filter(
          function (user) { return user.user_id === parseInt(self.actorId, 10); }
        )[0];
      },
      pageTitle: function pageTitle() {
        var self = this;
        if (!self.actorId) { return self.$t('invoicing.index.title', 'Orders'); }
        var actorName = self.$root.teamMembers.filter(
          function (user) { return user.user_id === parseInt(self.actorId, 10); }
        )[0].first_name;
        return self.$t('invoicing.index.title_user', { user: actorName });
      },
      orderedLists: function orderedLists() {
        var self = this;
        if (!self.lists) { return null; }
        return self.lists
          .sort(function (a, b) {
            return a.data.position - b.data.position;
          })
          .filter(function (list) { return list.data.active; });
      },
    },
    methods: {
      downloadCSV: function downloadCSV(orders, name) {
        var this$1 = this;

        orders.forEach(function (order, index) {
          this$1.traversalObject(order, index, true);
          this$1.csvValues[this$1.csvValues.length - 1] += '\n';
        });
        var text = (this.csvKeys.join(',')) + "\n" + (this.csvValues
          .join(',')
          .replace(/\n,/g, '\n'));
        var BOM = '\uFEFF';
        var fileName = name + ".csv";

        var downloadLink = document.createElement('a');
        downloadLink.href = "data:attachment/csv;charset=utf-8," + BOM + (encodeURIComponent(
          text
        ));
        downloadLink.target = '_blank';
        downloadLink.download = fileName;
        downloadLink.click();
      },
      traversalObject: function traversalObject(order, index, isFirst) {
        if ( isFirst === void 0 ) isFirst = false;

        // eslint-disable-next-line no-restricted-syntax
        for (var i in order) {
          if (typeof order[i] === 'object' && order[i] !== null) {
            this.traversalObject(order[i], index); // 递归遍历
          } else if (i === 'id' || i === 'user_id') {
            if (index === 0 && isFirst) {
              this.csvKeys.push(i);
            }
            if (isFirst) {
              if (i === 'user_id') {
                order[i] = this.orderUserName(order[i]);
              }
              this.csvValues.push(order[i]);
            }
          } else if (i === 'date') {
            if (index === 0) {
              this.csvKeys.push(i);
            }
            this.csvValues.push(this.orderDate(order[i]));
          } else if (i === 'assignee_id') {
            // 护工名字
            if (index === 0) {
              this.csvKeys.push(i);
            }
            var name = order[i] ? this.getAssigneeName(order[i]) : 'null';
            this.csvValues.push(name);
          } else if (i === 'vendor_coupon_id') {
            if (index === 0) {
              this.csvKeys.push('couponName', 'couponDiscount');
            }
            var name$1 = order[i] ? this.promotionName(order[i]) : 'null';
            var disCount = order[i] ? this.promotionDiscount(order[i]) : 'null';
            this.csvValues.push(name$1, disCount);
          } else if (
            i === 'status'
            || i === 'city'
            || i === 'created_at'
            || i === 'total'
            || i === 'address'
          ) {
            if (index === 0) {
              this.csvKeys.push(i);
            }
            if (typeof order[i] === 'string') {
              order[i] = order[i].split(',').join(' ');
            }
            this.csvValues.push(order[i] ? order[i] : 'null');
          }
        }
      },
      getAssigneeName: function getAssigneeName(id) {
        var name = this.$root.teamMembers.filter(
          function (m) { return m.user_id === parseInt(id, 10); }
        )[0];
        return name.last_name + name.first_name;
      },
      onSlideClick: function onSlideClick(e) {
        var self = this;
        var url = self
          .$$(e.target)
          .closest('a')
          .eq(0)
          .attr('data-url');
        if (!url) { return; }
        self.$f7router.navigate(url);
      },
      humanTime: humanTime,
      orderDate: function orderDate(date) {
        var self = this;
        if (!date) { return ''; }
        return self.$moment(parseInt(date, 10)).format('YYYY/MM/DD HH:mm');
      },
      orderUserName: function orderUserName(user_id) {
        var self = this;
        var user;
        if (self.isNurse) {
          user = self.orderContacts[user_id];
        }
        if (!user) {
          user = self.$root.teamMembers.filter(
            function (m) { return m.user_id === parseInt(user_id, 10); }
          )[0];
        }
        if (!user && self.contacts && self.contacts.length) {
          user = self.contacts.filter(
            function (c) { return c.friend_id === parseInt(user_id, 10); }
          )[0];
        }
        if (!user) { return ''; }
        return user.name || ((user.first_name || '') + " " + (user.last_name || ''));
      },
      listHasScroll: function listHasScroll(list) {
        var self = this;
        if (!list.orders || list.orders.length === 0) { return false; }
        var listContentEl = self.$$(
          (".orders-list[data-id=\"" + (list.id) + "\"] .orders-list-content")
        )[0];
        if (!listContentEl) { return false; }
        return listContentEl.scrollHeight > listContentEl.offsetHeight;
      },
      loadListOrders: function loadListOrders(list) {
        var self = this;
        API.loadListOrders(list).then(function (orders) {
          list.orders = orders;
          orders.forEach(function (order) {
            if (!self.isNurse) { return; }
            if (
              !self.orderContacts[order.user_id]
              && !self.orderContactsLoading[order.user_id]
            ) {
              self.orderContacts[order.user_id] = {};
              self.orderContactsLoading[order.user_id] = true;
              self.$api.getContact(order.user_id).then(function (contact) {
                self.orderContacts[order.user_id] = contact;
                self.orderContactsLoading[order.user_id] = false;
                self.$forceUpdate();
              });
            }
          });
          self.$nextTick(function () {
            if (self.listHasScroll(list)) {
              self.$set(self.listWithScroll, list.id, true);
            } else {
              self.$set(self.listWithScroll, list.id, false);
            }
          });
        });
      },
      reloadListsOrders: function reloadListsOrders() {
        var self = this;
        if (!self.lists) { return; }
        self.lists.forEach(function (list) {
          self.loadListOrders(list);
        });
      },
      loadLists: function loadLists(ignoreCache, createDefault) {
        if ( createDefault === void 0 ) createDefault = true;

        var self = this;
        API.loadLists({}, { cache: !ignoreCache }).then(function (lists) {
          lists.forEach(function (list) {
            list.orders = [];
          });
          self.lists = lists;
          if (!self.lists.length && createDefault) {
            API.createDefaultList(self.$root.user)
              .then(function () {
                self.loadLists(true, false);
              })
              .catch(function () {
                self.loadLists(true, false);
              });
          } else {
            self.lists.forEach(function (list) {
              if (!list.data.active) { return; }
              self.loadListOrders(list);
            });
          }
        });
      },
      reloadLists: function reloadLists() {
        var self = this;
        self.loadLists(true);
      },
      canEditList: function canEditList(list) {
        var self = this;
        if (self.isNurse && !self.actorId) { return false; }
        var account = self.$root.account;
        var isOwnerOrManager =        account.type === 'Team'
          || account.type === 'TeamMember'
          || account.roles.indexOf('Team Manager') >= 0;
        var isManager = account.roles.indexOf('Team Manager') >= 0;
        if (list.data.default && isManager) { return true; }
        if (list.data.default && !isOwnerOrManager) { return false; }
        if (list.permission_to.indexOf('update') !== -1) { return true; }
        return false;
      },
      promotionName: function promotionName(id) {
        var self = this;
        return self.promotions.filter(function (el) { return el.id === parseInt(id, 10); })[0].name;
      },
      promotionDiscount: function promotionDiscount(id) {
        var self = this;
        var promo = self.promotions.filter(function (el) { return el.id === parseInt(id, 10); })[0];
        if (!promo) { return 0; }
        if (promo.kind !== 'percentage') { return promo.amount; }
        return self.orderItemsTotal * promo.amount;
      },
    },
    beforeDestroy: function beforeDestroy() {
      var self = this;
      self.$events.$off('invoicing:reloadListsOrders', self.reloadListsOrders);
      self.$events.$off('invoicing:reloadLists', self.reloadLists);
    },
    mounted: function mounted() {
      var self = this;
      self.loadLists();
      if (!API.contacts) {
        self.$api.getContacts().then(function (c) {
          self.contacts = c;
          API.contacts = c;
        });
      }
      self.$events.$on('invoicing:reloadListsOrders', self.reloadListsOrders);
      self.$events.$on('invoicing:reloadLists', self.reloadLists);

      API.loadPromotions().then(function (promotions) {
        self.promotions = promotions;
      });
    },
  };

  function normalizeComponent(template, style, script, scopeId, isFunctionalTemplate, moduleIdentifier
  /* server only */
  , shadowMode, createInjector, createInjectorSSR, createInjectorShadow) {
    if (typeof shadowMode !== 'boolean') {
      createInjectorSSR = createInjector;
      createInjector = shadowMode;
      shadowMode = false;
    } // Vue.extend constructor export interop.


    var options = typeof script === 'function' ? script.options : script; // render functions

    if (template && template.render) {
      options.render = template.render;
      options.staticRenderFns = template.staticRenderFns;
      options._compiled = true; // functional template

      if (isFunctionalTemplate) {
        options.functional = true;
      }
    } // scopedId


    if (scopeId) {
      options._scopeId = scopeId;
    }

    var hook;

    if (moduleIdentifier) {
      // server build
      hook = function hook(context) {
        // 2.3 injection
        context = context || // cached call
        this.$vnode && this.$vnode.ssrContext || // stateful
        this.parent && this.parent.$vnode && this.parent.$vnode.ssrContext; // functional
        // 2.2 with runInNewContext: true

        if (!context && typeof __VUE_SSR_CONTEXT__ !== 'undefined') {
          context = __VUE_SSR_CONTEXT__;
        } // inject component styles


        if (style) {
          style.call(this, createInjectorSSR(context));
        } // register component module identifier for async chunk inference


        if (context && context._registeredComponents) {
          context._registeredComponents.add(moduleIdentifier);
        }
      }; // used by ssr in case component is cached and beforeCreate
      // never gets called


      options._ssrRegister = hook;
    } else if (style) {
      hook = shadowMode ? function () {
        style.call(this, createInjectorShadow(this.$root.$options.shadowRoot));
      } : function (context) {
        style.call(this, createInjector(context));
      };
    }

    if (hook) {
      if (options.functional) {
        // register for functional component in vue file
        var originalRender = options.render;

        options.render = function renderWithStyleInjection(h, context) {
          hook.call(context);
          return originalRender(h, context);
        };
      } else {
        // inject component registration as beforeCreate hook
        var existing = options.beforeCreate;
        options.beforeCreate = existing ? [].concat(existing, hook) : [hook];
      }
    }

    return script;
  }

  var normalizeComponent_1 = normalizeComponent;

  /* script */
  var __vue_script__ = script;

  /* template */
  var __vue_render__ = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-page",
      {
        staticClass: "invoicing-page",
        attrs: { id: "invoicing__index", name: "invoicing__index" }
      },
      [
        _c(
          "f7-navbar",
          [
            _c("tommy-nav-menu"),
            _vm._v(" "),
            _c("f7-nav-title", [_vm._v(_vm._s(_vm.pageTitle))]),
            _vm._v(" "),
            !_vm.isNurse
              ? _c(
                  "f7-nav-right",
                  [
                    _c("f7-link", {
                      attrs: { href: "/invoicing/settings/", "icon-f7": "gear" }
                    }),
                    _vm._v(" "),
                    _c("f7-link", {
                      attrs: {
                        href: "/invoicing/order-details/",
                        "icon-f7": "add"
                      }
                    })
                  ],
                  1
                )
              : _vm._e()
          ],
          1
        ),
        _vm._v(" "),
        _vm.orderedLists && _vm.orderedLists.length
          ? _c(
              "f7-swiper",
              {
                staticClass: "no-swipe-panel",
                attrs: {
                  params: {
                    slidesPerView: "auto",
                    breakpointsInverse: true,
                    centeredSlides: false,
                    touchMoveStopPropagation: false,
                    on: {
                      tap: _vm.onSlideClick
                    },
                    breakpoints: {
                      768: {
                        centeredSlides: true
                      }
                    }
                  }
                }
              },
              _vm._l(_vm.orderedLists, function(list) {
                return _c("f7-swiper-slide", { key: list.id }, [
                  _c(
                    "div",
                    {
                      staticClass: "orders-list",
                      class: { hasScroll: _vm.listWithScroll[list.id] },
                      attrs: { "data-id": list.id }
                    },
                    [
                      _c("div", { staticClass: "orders-list-header" }, [
                        _c("div", [_vm._v(_vm._s(list.name))]),
                        _vm._v(" "),
                        _c("div", { staticClass: "order-list-header-right" }, [
                          _vm.canEditList(list)
                            ? _c(
                                "a",
                                {
                                  attrs: {
                                    "data-url":
                                      "/invoicing/list-edit/" + list.id + "/"
                                  }
                                },
                                [
                                  _c("img", {
                                    attrs: {
                                      src: _vm.$addonAssetsUrl + "slice6.png",
                                      srcset:
                                        _vm.$addonAssetsUrl +
                                        "slice6@2x.png 2x, " +
                                        _vm.$addonAssetsUrl +
                                        "slice6@3x.png 3x"
                                    }
                                  })
                                ]
                              )
                            : _vm._e(),
                          _vm._v(" "),
                          _vm.canEditList(list) && list.orders.length > 0
                            ? _c(
                                "a",
                                {
                                  ref: "download",
                                  refInFor: true,
                                  on: {
                                    click: function($event) {
                                      return _vm.downloadCSV(
                                        list.orders,
                                        list.name
                                      )
                                    }
                                  }
                                },
                                [
                                  _c("img", {
                                    attrs: {
                                      src: _vm.$addonAssetsUrl + "slice20.png",
                                      srcset:
                                        _vm.$addonAssetsUrl +
                                        "slice20@2x.png 2x, " +
                                        _vm.$addonAssetsUrl +
                                        "slice20@3x.png 3x"
                                    }
                                  })
                                ]
                              )
                            : _vm._e()
                        ])
                      ]),
                      _vm._v(" "),
                      _c(
                        "div",
                        { staticClass: "orders-list-content" },
                        [
                          list.orders && list.orders.length
                            ? _vm._l(list.orders, function(order, index) {
                                return _c(
                                  "a",
                                  {
                                    key: index,
                                    staticClass: "card invoicing-order-card",
                                    attrs: {
                                      "data-url":
                                        "/invoicing/order-details/" +
                                        order.id +
                                        "/"
                                    }
                                  },
                                  [
                                    _c("div", { staticClass: "card-header" }, [
                                      order.data && order.data.date
                                        ? _c(
                                            "span",
                                            { staticClass: "order-date" },
                                            [
                                              _vm._v(
                                                _vm._s(
                                                  _vm.orderDate(
                                                    order.data
                                                      ? order.data.date
                                                      : null
                                                  )
                                                )
                                              )
                                            ]
                                          )
                                        : _vm._e(),
                                      _vm._v(" "),
                                      !_vm.isNurse
                                        ? _c(
                                            "span",
                                            { staticClass: "order-status" },
                                            [
                                              _vm._v(
                                                _vm._s(
                                                  _vm.$t(
                                                    "invoicing.order_status." +
                                                      order.status
                                                  )
                                                )
                                              )
                                            ]
                                          )
                                        : _vm._e()
                                    ]),
                                    _vm._v(" "),
                                    _c(
                                      "div",
                                      { staticClass: "card-content" },
                                      [
                                        _c(
                                          "f7-list",
                                          {
                                            staticClass:
                                              "no-hairlines no-hairlines-between"
                                          },
                                          [
                                            order.user_id
                                              ? _c(
                                                  "f7-list-item",
                                                  {
                                                    attrs: {
                                                      title: _vm.orderUserName(
                                                        order.user_id
                                                      )
                                                    }
                                                  },
                                                  [
                                                    _c("img", {
                                                      attrs: {
                                                        slot: "media",
                                                        src:
                                                          _vm.$addonAssetsUrl +
                                                          "icon-user.svg"
                                                      },
                                                      slot: "media"
                                                    })
                                                  ]
                                                )
                                              : _vm._e(),
                                            _vm._v(" "),
                                            _c(
                                              "f7-list-item",
                                              { attrs: { title: order.name } },
                                              [
                                                _c("img", {
                                                  attrs: {
                                                    slot: "media",
                                                    src:
                                                      _vm.$addonAssetsUrl +
                                                      "icon-product.svg"
                                                  },
                                                  slot: "media"
                                                })
                                              ]
                                            ),
                                            _vm._v(" "),
                                            order.total && !_vm.isNurse
                                              ? _c(
                                                  "f7-list-item",
                                                  {
                                                    attrs: { title: order.total }
                                                  },
                                                  [
                                                    _c("img", {
                                                      attrs: {
                                                        slot: "media",
                                                        src:
                                                          _vm.$addonAssetsUrl +
                                                          "icon-money.svg"
                                                      },
                                                      slot: "media"
                                                    })
                                                  ]
                                                )
                                              : _vm._e(),
                                            _vm._v(" "),
                                            order.data && order.data.location
                                              ? _c(
                                                  "f7-list-item",
                                                  {
                                                    attrs: {
                                                      title:
                                                        order.data.location
                                                          .address +
                                                        " " +
                                                        order.data.location.city
                                                    }
                                                  },
                                                  [
                                                    _c("img", {
                                                      attrs: {
                                                        slot: "media",
                                                        src:
                                                          _vm.$addonAssetsUrl +
                                                          "icon-location.svg"
                                                      },
                                                      slot: "media"
                                                    })
                                                  ]
                                                )
                                              : _vm._e()
                                          ],
                                          1
                                        )
                                      ],
                                      1
                                    )
                                  ]
                                )
                              })
                            : _vm._e()
                        ],
                        2
                      )
                    ]
                  )
                ])
              }),
              1
            )
          : _vm._e()
      ],
      1
    )
  };
  var __vue_staticRenderFns__ = [];
  __vue_render__._withStripped = true;

    /* style */
    var __vue_inject_styles__ = undefined;
    /* scoped */
    var __vue_scope_id__ = undefined;
    /* module identifier */
    var __vue_module_identifier__ = undefined;
    /* functional template */
    var __vue_is_functional_template__ = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var IndexPage = normalizeComponent_1(
      { render: __vue_render__, staticRenderFns: __vue_staticRenderFns__ },
      __vue_inject_styles__,
      __vue_script__,
      __vue_scope_id__,
      __vue_is_functional_template__,
      __vue_module_identifier__,
      undefined,
      undefined
    );

  //

  var script$1 = {
    data: function data() {
      return {
        isNurse: API.isNurse,
      };
    },
  };

  /* script */
  var __vue_script__$1 = script$1;

  /* template */
  var __vue_render__$1 = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-page",
      {
        staticClass: "invoicing-page",
        attrs: { id: "invoicing__settings", "data-name": "invoicing__settings" }
      },
      [
        _c(
          "f7-navbar",
          [
            _c("tommy-nav-back"),
            _vm._v(" "),
            _c("f7-nav-title", [
              _vm._v(_vm._s(_vm.$t("invoicing.settings.title", "Settings")))
            ])
          ],
          1
        ),
        _vm._v(" "),
        _c(
          "f7-list",
          { staticClass: "list-custom" },
          [
            !_vm.hasActorId
              ? _c("f7-list-item", {
                  attrs: {
                    link: "/invoicing/list-management/",
                    title: _vm.$t(
                      "invoicing.settings.list_management",
                      "List Management"
                    )
                  }
                })
              : _vm._e(),
            _vm._v(" "),
            !_vm.isNurse
              ? _c("f7-list-item", {
                  attrs: {
                    link: "/invoicing/item-service-management/",
                    title: _vm.$t(
                      "invoicing.settings.item_service_management",
                      "Item/Service Management"
                    )
                  }
                })
              : _vm._e(),
            _vm._v(" "),
            !_vm.isNurse
              ? _c("f7-list-item", {
                  attrs: {
                    link: "/invoicing/promotion-management/",
                    title: _vm.$t(
                      "invoicing.settings.promotion_management",
                      "Promotion Management"
                    )
                  }
                })
              : _vm._e()
          ],
          1
        )
      ],
      1
    )
  };
  var __vue_staticRenderFns__$1 = [];
  __vue_render__$1._withStripped = true;

    /* style */
    var __vue_inject_styles__$1 = undefined;
    /* scoped */
    var __vue_scope_id__$1 = undefined;
    /* module identifier */
    var __vue_module_identifier__$1 = undefined;
    /* functional template */
    var __vue_is_functional_template__$1 = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var SettingsPage = normalizeComponent_1(
      { render: __vue_render__$1, staticRenderFns: __vue_staticRenderFns__$1 },
      __vue_inject_styles__$1,
      __vue_script__$1,
      __vue_scope_id__$1,
      __vue_is_functional_template__$1,
      __vue_module_identifier__$1,
      undefined,
      undefined
    );

  //

  var script$2 = {
    data: function data() {
      return {
        items: null,
        packages: null,
        activeTab: 'items',
      };
    },
    mounted: function mounted() {
      var self = this;
      self.loadProducts();
      self.loadPackages();
      self.$events.$on('invoicing:reloadProducts', self.loadProducts);
      self.$events.$on('invoicing:reloadPackages', self.loadPackages);
    },
    beforeDestroy: function beforeDestroy() {
      var self = this;
      self.$events.$off('invoicing:reloadProducts', self.loadProducts);
      self.$events.$off('invoicing:reloadPackages', self.loadPackages);
    },
    computed: {
      orderedProducts: function orderedProducts() {
        var self = this;
        if (!self.items) { return []; }
        return self.items.sort(function (a, b) { return a.id - b.id; });
      },
      orderedPackages: function orderedPackages() {
        var self = this;
        if (!self.packages) { return []; }
        return self.packages.sort(function (a, b) { return a.id - b.id; });
      },
    },
    methods: {
      addItem: function addItem() {
        var self = this;
        if (self.activeTab === 'items') {
          self.$f7router.navigate('/invoicing/product-details/');
        } else {
          self.$f7router.navigate('/invoicing/package-details/');
        }
      },
      loadPackages: function loadPackages() {
        var self = this;
        API.loadPackages({}, { cache: false }).then(function (packages) {
          self.packages = packages;
        });
      },
      loadProducts: function loadProducts() {
        var self = this;
        API.loadProducts({}, { cache: false }).then(function (items) {
          self.items = items;
        });
      },
      add: function add() {},
    },
  };

  /* script */
  var __vue_script__$2 = script$2;

  /* template */
  var __vue_render__$2 = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-page",
      {
        staticClass: "invoicing-page",
        attrs: {
          name: "invoicing__item-service-management",
          id: "invoicing__item-service-management"
        }
      },
      [
        _c(
          "f7-navbar",
          [
            _c("tommy-nav-back"),
            _vm._v(" "),
            _c("f7-nav-title", [
              _vm._v(
                _vm._s(
                  _vm.$t(
                    "invoicing.item_service_management.title",
                    "Items / Service"
                  )
                )
              )
            ]),
            _vm._v(" "),
            _c(
              "f7-nav-right",
              [
                _c("f7-link", {
                  attrs: { "icon-f7": "add" },
                  on: { click: _vm.addItem }
                })
              ],
              1
            )
          ],
          1
        ),
        _vm._v(" "),
        _c(
          "div",
          { staticClass: "item-service-tabs-links" },
          [
            _c(
              "f7-link",
              {
                class: { active: _vm.activeTab === "items" },
                on: {
                  click: function($event) {
                    _vm.activeTab = "items";
                  }
                }
              },
              [
                _vm._v(
                  _vm._s(_vm.$t("invoicing.item_service_management.items_tab"))
                )
              ]
            ),
            _vm._v(" "),
            _c(
              "f7-link",
              {
                class: { active: _vm.activeTab === "packages" },
                on: {
                  click: function($event) {
                    _vm.activeTab = "packages";
                  }
                }
              },
              [
                _vm._v(
                  _vm._s(_vm.$t("invoicing.item_service_management.packages_tab"))
                )
              ]
            )
          ],
          1
        ),
        _vm._v(" "),
        _c(
          "div",
          {
            directives: [
              {
                name: "show",
                rawName: "v-show",
                value: _vm.activeTab === "items",
                expression: "activeTab === 'items'"
              }
            ],
            staticClass: "item-service-tab"
          },
          [
            _vm.items && _vm.items.length
              ? _c("f7-searchbar", {
                  attrs: {
                    "search-container": ".invoicing-list-items",
                    backdrop: false,
                    "disable-button": false,
                    placeholder: _vm.$t(
                      "invoicing.item_service_management.search_items"
                    )
                  }
                })
              : _vm._e(),
            _vm._v(" "),
            _vm.items && _vm.items.length
              ? _c(
                  "f7-list",
                  {
                    staticClass: "list-custom invoicing-list-items",
                    attrs: { "no-hairlines": "" }
                  },
                  _vm._l(_vm.orderedProducts, function(item) {
                    return _c("f7-list-item", {
                      key: item.id,
                      attrs: {
                        title: item.name,
                        link:
                          "/invoicing/product-details/" +
                          item.id +
                          "/?title=" +
                          (item.name || "")
                      }
                    })
                  }),
                  1
                )
              : _vm._e()
          ],
          1
        ),
        _vm._v(" "),
        _c(
          "div",
          {
            directives: [
              {
                name: "show",
                rawName: "v-show",
                value: _vm.activeTab === "packages",
                expression: "activeTab === 'packages'"
              }
            ],
            staticClass: "item-service-tab"
          },
          [
            _vm.packages && _vm.packages.length
              ? _c("f7-searchbar", {
                  attrs: {
                    "search-container": ".invoicing-list-packages",
                    backdrop: false,
                    "disable-button": false,
                    placeholder: _vm.$t(
                      "invoicing.item_service_management.search_packages"
                    )
                  }
                })
              : _vm._e(),
            _vm._v(" "),
            _vm.packages && _vm.packages.length
              ? _c(
                  "f7-list",
                  {
                    staticClass: "list-custom invoicing-list-packages",
                    attrs: { "no-hairlines": "" }
                  },
                  _vm._l(_vm.orderedPackages, function(item) {
                    return _c("f7-list-item", {
                      key: item.id,
                      attrs: {
                        title: item.name,
                        link:
                          "/invoicing/package-details/" +
                          item.id +
                          "/?title=" +
                          (item.name || "")
                      }
                    })
                  }),
                  1
                )
              : _vm._e()
          ],
          1
        )
      ],
      1
    )
  };
  var __vue_staticRenderFns__$2 = [];
  __vue_render__$2._withStripped = true;

    /* style */
    var __vue_inject_styles__$2 = undefined;
    /* scoped */
    var __vue_scope_id__$2 = undefined;
    /* module identifier */
    var __vue_module_identifier__$2 = undefined;
    /* functional template */
    var __vue_is_functional_template__$2 = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var ItemServiceManagementPage = normalizeComponent_1(
      { render: __vue_render__$2, staticRenderFns: __vue_staticRenderFns__$2 },
      __vue_inject_styles__$2,
      __vue_script__$2,
      __vue_scope_id__$2,
      __vue_is_functional_template__$2,
      __vue_module_identifier__$2,
      undefined,
      undefined
    );

  //

  var script$3 = {
    data: function data() {
      return {
        saving: false,
        showSave: false,
        lists: null,
      };
    },
    mounted: function mounted() {
      var self = this;
      API.loadLists({}, { cache: false }).then(function (lists) {
        self.lists = lists;
      });
    },
    computed: {
      orderedLists: function orderedLists() {
        var self = this;
        if (!self.lists) { return null; }
        return self.lists.sort(function (a, b) {
          return a.data.position - b.data.position;
        });
      },
    },
    methods: {
      onSort: function onSort(e, ref) {
        if ( ref === void 0 ) ref = {};
        var from = ref.from;
        var to = ref.to;

        var self = this;
        if (self.saving) { return; }
        self.showSave = true;
        self.$nextTick(function () {
          var ref;

          self.lists[from].data.position = to;
          (ref = self.lists).splice.apply(ref, [ to, 0 ].concat( self.lists.splice(from, 1) ));
          self.$forceUpdate();
        });
      },
      toggleListActive: function toggleListActive(list, active) {
        var self = this;
        if (self.saving) { return; }
        self.showSave = true;
        list.data.active = active;
      },
      save: function save() {
        var self = this;
        self.showSave = false;
        var promises = [];
        self.lists.forEach(function (list, index) {
          list.data.position = index;
          promises.push(API.saveList(list));
        });
        Promise.all(promises).then(function () {
          self.$events.$emit('invoicing:reloadLists');
          self.$f7router.back();
        });
      },
    },
  };

  /* script */
  var __vue_script__$3 = script$3;

  /* template */
  var __vue_render__$3 = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-page",
      {
        staticClass: "invoicing-page",
        attrs: {
          name: "invoicing__list-management",
          id: "invoicing__list-management"
        }
      },
      [
        _c(
          "f7-navbar",
          [
            _c("tommy-nav-back"),
            _vm._v(" "),
            _c("f7-nav-title", [
              _vm._v(
                _vm._s(
                  _vm.$t("invoicing.list_management.title", "List Management")
                )
              )
            ]),
            _vm._v(" "),
            _c(
              "f7-nav-right",
              [
                _vm.showSave
                  ? _c("f7-link", {
                      attrs: { "icon-f7": "check" },
                      on: { click: _vm.save }
                    })
                  : _vm._e()
              ],
              1
            )
          ],
          1
        ),
        _vm._v(" "),
        _vm.lists
          ? _c(
              "f7-list",
              {
                staticClass: "list-custom",
                attrs: { sortable: "", sortableEnabled: "", inset: "" },
                on: { "sortable:sort": _vm.onSort }
              },
              _vm._l(_vm.orderedLists, function(list) {
                return _c("f7-list-item", {
                  key: list.id,
                  attrs: {
                    checkbox: "",
                    checked: list.data.active,
                    title: list.name
                  },
                  on: {
                    change: function($event) {
                      return _vm.toggleListActive(list, $event.target.checked)
                    }
                  }
                })
              }),
              1
            )
          : _vm._e(),
        _vm._v(" "),
        _c(
          "f7-list",
          { staticClass: "list-custom margin-bottom", attrs: { inset: "" } },
          [
            _c("f7-list-item", {
              attrs: {
                link: "/invoicing/list-add/",
                title: _vm.$t(
                  "invoicing.list_management.create_list",
                  "Create New List"
                )
              }
            })
          ],
          1
        )
      ],
      1
    )
  };
  var __vue_staticRenderFns__$3 = [];
  __vue_render__$3._withStripped = true;

    /* style */
    var __vue_inject_styles__$3 = undefined;
    /* scoped */
    var __vue_scope_id__$3 = undefined;
    /* module identifier */
    var __vue_module_identifier__$3 = undefined;
    /* functional template */
    var __vue_is_functional_template__$3 = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var ListManagementPage = normalizeComponent_1(
      { render: __vue_render__$3, staticRenderFns: __vue_staticRenderFns__$3 },
      __vue_inject_styles__$3,
      __vue_script__$3,
      __vue_scope_id__$3,
      __vue_is_functional_template__$3,
      __vue_module_identifier__$3,
      undefined,
      undefined
    );

  //

  var script$4 = {
    data: function data() {
      return {
        saving: false,
        name: '',
      };
    },
    computed: {
      showSave: function showSave() {
        return this.name.trim().length;
      },
    },
    methods: {
      save: function save() {
        var self = this;
        if (self.saving) { return; }
        self.saving = true;

        API
          .saveList({
            name: self.name,
          })
          .then(function () {
            self.$events.$emit('invoicing:reloadLists');
            self.$f7router.back(("/invoicing/" + (API.actorId ? ("?actor_id=" + (API.actorId)) : '')), { force: true });
          });
      },
    },
  };

  /* script */
  var __vue_script__$4 = script$4;

  /* template */
  var __vue_render__$4 = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-page",
      {
        staticClass: "invoicing-page",
        attrs: { name: "invoicing__list-add", id: "invoicing__list-add" }
      },
      [
        _c(
          "f7-navbar",
          [
            _c("tommy-nav-back"),
            _vm._v(" "),
            _c("f7-nav-title", [
              _vm._v(_vm._s(_vm.$t("invoicing.list_add.title", "Add List")))
            ]),
            _vm._v(" "),
            _c(
              "f7-nav-right",
              [
                _vm.showSave
                  ? _c("f7-link", {
                      attrs: { "icon-f7": "check" },
                      on: { click: _vm.save }
                    })
                  : _vm._e()
              ],
              1
            )
          ],
          1
        ),
        _vm._v(" "),
        _c(
          "f7-list",
          { staticClass: "top-0 list-custom" },
          [
            _c(
              "f7-list-item",
              [
                _c("f7-input", {
                  attrs: {
                    type: "text",
                    placeholder: _vm.$t(
                      "invoicing.list_add.name_placeholder",
                      "Name"
                    ),
                    value: _vm.name
                  },
                  on: {
                    input: function($event) {
                      _vm.name = $event.target.value;
                    }
                  }
                })
              ],
              1
            )
          ],
          1
        )
      ],
      1
    )
  };
  var __vue_staticRenderFns__$4 = [];
  __vue_render__$4._withStripped = true;

    /* style */
    var __vue_inject_styles__$4 = undefined;
    /* scoped */
    var __vue_scope_id__$4 = undefined;
    /* module identifier */
    var __vue_module_identifier__$4 = undefined;
    /* functional template */
    var __vue_is_functional_template__$4 = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var ListAddPage = normalizeComponent_1(
      { render: __vue_render__$4, staticRenderFns: __vue_staticRenderFns__$4 },
      __vue_inject_styles__$4,
      __vue_script__$4,
      __vue_scope_id__$4,
      __vue_is_functional_template__$4,
      __vue_module_identifier__$4,
      undefined,
      undefined
    );

  var orderStatuses = ['pending', 'paid', 'processing', 'qa', 'complete'];

  function formatDate(date) {
    var d = new Date(date);
    var year = d.getFullYear();
    var month = d.getMonth() + 1;
    var day = d.getDate();
    if (month < 10) { month = "0" + month; }
    if (day < 10) { day = "0" + day; }
    return (year + "-" + month + "-" + day);
  }
  function formatDateRange (range) {
    if (!range) { return ''; }
    if (typeof range === 'string') {
      return window.tommy.i18n.t(("invoicing.date_range." + range));
    }
    if (Array.isArray(range)) {
      return ((formatDate(range[0])) + " - " + (formatDate(range[1])));
    }
    return range || '';
  }

  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //

  var script$5 = {
    props: {
      data: Object,
    },
    data: function data() {
      return {
        teamTags: null,
        // sheetOpened: false,
        // popoverOpened: false,
      };
    },
    mounted: function mounted() {
      var self = this;
      self.$api.getCurrentTeamTags({ cache: false }).then(function (tagItems) {
        self.teamTags = tagItems;
      });
    },
    methods: {
      openSelector: function openSelector() {
        var self = this;
        self.$f7router.navigate('/invoicing/tag-select/', {
          props: {
            tags: self.data.tags,
            pageTitle: self.data.pageTitle,
            teamTags: self.teamTags,
            onChange: function onChange(tag, selected) {
              if (selected) {
                self.$emit('tagAdd', tag);
              } else {
                self.$emit('tagRemove', tag);
              }
            },
          },
        });
      },
      removeTag: function removeTag(tag) {
        var self = this;
        self.$emit('tagRemove', tag);
      },
    },
  };

  /* script */
  var __vue_script__$5 = script$5;

  /* template */
  var __vue_render__$5 = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "div",
      { staticClass: "tag-select tasks-tag-select orders-list-tags-select" },
      [
        _c("ul", [
          _c("li", { staticClass: "item-divider" }, [
            _vm._v(_vm._s(_vm.data.title))
          ]),
          _vm._v(" "),
          _c("li", [
            _c(
              "a",
              {
                staticClass: "item-link tag-search",
                attrs: { href: "#" },
                on: { click: _vm.openSelector }
              },
              [
                _c("div", { staticClass: "item-content" }, [
                  _vm._m(0),
                  _vm._v(" "),
                  _c("div", { staticClass: "item-inner" }, [
                    _c("div", { staticClass: "item-title" }, [
                      _vm._v(_vm._s(_vm.data.placeholder))
                    ])
                  ])
                ])
              ]
            )
          ])
        ]),
        _vm._v(" "),
        _c(
          "ul",
          { staticClass: "tag-items" },
          _vm._l(_vm.data.tags, function(tag, index) {
            return _c("li", { key: index, staticClass: "tag-item" }, [
              _c("div", { staticClass: "item-content" }, [
                _c("div", { staticClass: "item-inner" }, [
                  _c("div", { staticClass: "item-title" }, [
                    _vm._v(_vm._s(tag.name))
                  ]),
                  _vm._v(" "),
                  _c("div", { staticClass: "item-after" }, [
                    _c(
                      "a",
                      {
                        staticClass: "item-link",
                        staticStyle: { height: "24px" },
                        attrs: { href: "#" },
                        on: {
                          click: function($event) {
                            return _vm.removeTag(tag)
                          }
                        }
                      },
                      [
                        _c("i", { staticClass: "material-icons" }, [
                          _vm._v("close")
                        ])
                      ]
                    )
                  ])
                ])
              ])
            ])
          }),
          0
        )
      ]
    )
  };
  var __vue_staticRenderFns__$5 = [
    function() {
      var _vm = this;
      var _h = _vm.$createElement;
      var _c = _vm._self._c || _h;
      return _c("div", { staticClass: "item-media" }, [
        _c("i", { staticClass: "material-icons md-36" }, [_vm._v("search")])
      ])
    }
  ];
  __vue_render__$5._withStripped = true;

    /* style */
    var __vue_inject_styles__$5 = undefined;
    /* scoped */
    var __vue_scope_id__$5 = undefined;
    /* module identifier */
    var __vue_module_identifier__$5 = undefined;
    /* functional template */
    var __vue_is_functional_template__$5 = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var tagSelect = normalizeComponent_1(
      { render: __vue_render__$5, staticRenderFns: __vue_staticRenderFns__$5 },
      __vue_inject_styles__$5,
      __vue_script__$5,
      __vue_scope_id__$5,
      __vue_is_functional_template__$5,
      __vue_module_identifier__$5,
      undefined,
      undefined
    );

  //

  var script$6 = {
    components: {
      tagSelect: tagSelect,
    },
    props: {
      listId: [String, Number],
    },
    data: function data() {
      return {
        showSave: false,
        id: parseInt(this.listId, 10),
        orderStatuses: orderStatuses,
        list: null,
        permissions: [],
        contacts: API.contacts,
      };
    },
    beforeDestroy: function beforeDestroy() {
      var self = this;
      self.$events.$off('invoicing:setListDateRange', self.updateListDateRange);
    },
    mounted: function mounted() {
      var self = this;
      API.loadList(self.id).then(function (list) {
        if (!list.data) { list.data = {}; }
        if (!list.data.status) { list.data.status = []; }
        if (!list.data.customer) { list.data.customer = []; }
        if (!list.data.assignee) { list.data.assignee = []; }
        self.list = list;
        self.$api.getInstalledAddonPermission('invoicing', 'order_list_read_access', {
          taggable_id: list.id,
          with_filters: true,
        }).then(function (permission) {
          permission.taggable_id = list.id;
          self.permissions.push(permission);
        });
        self.$api.getInstalledAddonPermission('invoicing', 'order_list_edit_access', {
          taggable_id: list.id,
          with_filters: true,
        }).then(function (permission) {
          permission.taggable_id = list.id;
          self.permissions.push(permission);
        });
        if (!API.contacts) {
          self.$api.getContacts().then(function (c) {
            self.contacts = c;
            API.contacts = c;
          });
        }
      });
      self.$events.$on('invoicing:setListDateRange', self.updateListDateRange);
    },
    methods: {
      formatDateRange: formatDateRange,
      updateListDateRange: function updateListDateRange(listId, range) {
        var self = this;
        if (self.list.id !== listId) { return; }
        self.list.data.date_range = range;
      },

      onNameChange: function onNameChange(name) {
        var self = this;
        if (self.saving) { return; }
        self.list.name = name;
        self.showSave = true;
      },
      onSortChange: function onSortChange(e) {
        var self = this;
        if (self.saving) { return; }
        self.list.data.sort = self.$$(e.target).val();
        self.showSave = true;
      },
      onStatusChange: function onStatusChange(e) {
        var self = this;
        if (self.saving) { return; }
        self.list.data.status = self.$$(e.target).val();
        self.showSave = true;
      },
      onTypeChange: function onTypeChange(e) {
        var self = this;
        if (self.saving) { return; }
        self.list.data.type = e.target.value;
        self.showSave = true;
      },
      onCustomerChange: function onCustomerChange(e) {
        var self = this;
        if (self.saving) { return; }
        self.list.data.customer = self.$$(e.target).val().map(function (el) { return parseInt(el, 10); });
        self.showSave = true;
      },
      onAssigneeChange: function onAssigneeChange(e) {
        var self = this;
        if (self.saving) { return; }
        self.list.data.assignee = self.$$(e.target).val().map(function (el) { return parseInt(el, 10); });
        self.showSave = true;
      },
      setOnlyAssigned: function setOnlyAssigned(checked) {
        var self = this;
        self.list.data.only_assigned = checked;
        self.showSave = true;
        if (checked) {
          self.list.data.assignee = [];
        }
      },
      showDateRange: function showDateRange() {
        var self = this;
        self.$f7router.navigate('/invoicing/list-edit/date-range/', {
          props: {
            list: self.list,
          },
        });
      },
      showBalanceRange: function showBalanceRange() {
        var self = this;
        var ref = self.list.data;
        var balance_min = ref.balance_min;
        var balance_max = ref.balance_max;
        self.$f7router.navigate('/invoicing/range-select/', {
          props: {
            pageTitle: self.$t('invoicing.list_edit.balance_range'),
            from: balance_min ? parseFloat(balance_min) : balance_min,
            to: balance_max ? parseFloat(balance_max) : balance_max,
            onSave: function onSave(ref) {
              var from = ref.from;
              var to = ref.to;

              self.list.data.balance_min = from;
              self.list.data.balance_max = to;
              self.list = self.list;
              API.saveList(self.list).then(function () {
                self.$f7router.back();
              });
            },
          },
        });
      },
      showPaymentRange: function showPaymentRange() {
        var self = this;
        var ref = self.list.data;
        var price_min = ref.price_min;
        var price_max = ref.price_max;
        self.$f7router.navigate('/invoicing/range-select/', {
          props: {
            pageTitle: self.$t('invoicing.list_edit.payment_range'),
            from: price_min ? parseFloat(price_min) : price_min,
            to: price_max ? parseFloat(price_max) : price_max,
            onSave: function onSave(ref) {
              var from = ref.from;
              var to = ref.to;

              self.list.data.price_min = from;
              self.list.data.price_max = to;
              self.list = self.list;
              API.saveList(self.list).then(function () {
                self.$f7router.back();
              });
            },
          },
        });
      },
      save: function save() {
        var self = this;
        if (self.saving) { return; }
        self.saving = true;
        self.showSave = false;
        API.saveList(self.list).then(function () {
          self.$events.$emit('invoicing:reloadLists', self.listId);
          self.$f7router.back();
        });
      },
      deleteList: function deleteList() {
        var self = this;
        if (self.saving) { return; }
        self.saving = true;
        self.showSave = false;
        API.deleteList(self.list.id, self.list).then(function () {
          self.$events.$emit('invoicing:reloadLists', self.listId);
          self.$f7router.back();
        });
      },
      saveListPermission: function saveListPermission(permission) {
        var self = this;
        self.$api.updateInstalledAddonPermission('invoicing', permission.name, {
          taggable_id: permission.taggable_id,
          with_filters: true,
          filters: JSON.stringify(permission.filters),
        });
      },
      addListPermission: function addListPermission(permission, tag) {
        var self = this;
        permission.filters.push(tag);
        self.saveListPermission(permission);
      },
      removeListPermission: function removeListPermission(permission, tag) {
        var self = this;
        permission.filters.splice(permission.filters.indexOf(tag), 1);
        self.saveListPermission(permission);
      },
    },
  };

  /* script */
  var __vue_script__$6 = script$6;

  /* template */
  var __vue_render__$6 = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-page",
      {
        staticClass: "invoicing-page",
        attrs: { name: "invoicing__list-edit", id: "invoicing__list-edit" }
      },
      [
        _c(
          "f7-navbar",
          [
            _c("tommy-nav-back"),
            _vm._v(" "),
            _c("f7-nav-title", [
              _vm._v(_vm._s(_vm.$t("invoicing.list_edit.title", "Edit List")))
            ]),
            _vm._v(" "),
            _c(
              "f7-nav-right",
              [
                _vm.showSave
                  ? _c("f7-link", {
                      attrs: { "icon-f7": "check" },
                      on: { click: _vm.save }
                    })
                  : _vm._e()
              ],
              1
            )
          ],
          1
        ),
        _vm._v(" "),
        _vm.list
          ? _c(
              "f7-list",
              { staticClass: "list-custom" },
              [
                _c(
                  "f7-list-item",
                  [
                    _c("f7-label", [
                      _vm._v(_vm._s(_vm.$t("invoicing.list_edit.name", "Name")))
                    ]),
                    _vm._v(" "),
                    _c("f7-input", {
                      attrs: { type: "text", value: _vm.list.name },
                      on: {
                        input: function($event) {
                          return _vm.onNameChange($event.target.value)
                        }
                      }
                    })
                  ],
                  1
                ),
                _vm._v(" "),
                _c(
                  "f7-list-item",
                  {
                    attrs: {
                      "smart-select": "",
                      "smart-select-params": { closeOnSelect: true },
                      title: _vm.$t("invoicing.list_edit.sort", "Sort")
                    }
                  },
                  [
                    _c(
                      "select",
                      {
                        staticClass: "toggle-save",
                        attrs: { name: "sort" },
                        on: { change: _vm.onSortChange }
                      },
                      _vm._l(
                        ["default", "price_high", "price_low", "newest"],
                        function(sorting, index) {
                          return _c(
                            "option",
                            {
                              key: index,
                              domProps: {
                                value: sorting,
                                selected:
                                  _vm.list.data.sort === sorting ||
                                  (sorting === "default" && !_vm.list.data.sort)
                              }
                            },
                            [
                              _vm._v(
                                _vm._s(
                                  _vm.$t("invoicing.list_edit.sort_" + sorting)
                                )
                              )
                            ]
                          )
                        }
                      ),
                      0
                    )
                  ]
                ),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    link: "#",
                    title: _vm.$t("invoicing.common.date_range", "Date Range"),
                    after: _vm.formatDateRange(_vm.list.data.date_range)
                  },
                  on: { click: _vm.showDateRange }
                }),
                _vm._v(" "),
                _c(
                  "f7-list-item",
                  {
                    attrs: {
                      "smart-select": "",
                      "smart-select-params": {
                        openIn: "popover",
                        closeOnSelect: true
                      },
                      title: _vm.$t("invoicing.list_edit.filter_status", "Status")
                    }
                  },
                  [
                    _c(
                      "select",
                      {
                        staticClass: "toggle-save",
                        attrs: { name: "statuses", multiple: "" },
                        on: { change: _vm.onStatusChange }
                      },
                      _vm._l(_vm.orderStatuses, function(status, index) {
                        return _c(
                          "option",
                          {
                            key: index,
                            domProps: {
                              value: status,
                              selected:
                                _vm.list.data.status.indexOf(status) >= 0 ||
                                !_vm.list.data.status
                            }
                          },
                          [
                            _vm._v(
                              _vm._s(_vm.$t("invoicing.order_status." + status))
                            )
                          ]
                        )
                      }),
                      0
                    )
                  ]
                ),
                _vm._v(" "),
                _c(
                  "f7-list-item",
                  {
                    attrs: {
                      "smart-select": "",
                      "smart-select-params": {
                        openIn: "popover",
                        closeOnSelect: true
                      },
                      title: _vm.$t("invoicing.list_edit.type")
                    }
                  },
                  [
                    _c(
                      "select",
                      {
                        attrs: { name: "type" },
                        on: { change: _vm.onTypeChange }
                      },
                      [
                        _c(
                          "option",
                          {
                            attrs: { value: "all" },
                            domProps: {
                              selected:
                                _vm.list.data.type === "all" ||
                                !_vm.list.data.type
                            }
                          },
                          [_vm._v(_vm._s(_vm.$t("invoicing.list_edit.type_all")))]
                        ),
                        _vm._v(" "),
                        _c(
                          "option",
                          {
                            attrs: { value: "invoice" },
                            domProps: {
                              selected: _vm.list.data.type === "invoice"
                            }
                          },
                          [
                            _vm._v(
                              _vm._s(_vm.$t("invoicing.list_edit.type_invoice"))
                            )
                          ]
                        ),
                        _vm._v(" "),
                        _c(
                          "option",
                          {
                            attrs: { value: "quote" },
                            domProps: { selected: _vm.list.data.type === "quote" }
                          },
                          [
                            _vm._v(
                              _vm._s(_vm.$t("invoicing.list_edit.type_quote"))
                            )
                          ]
                        )
                      ]
                    )
                  ]
                ),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    link: "",
                    title: _vm.$t("invoicing.list_edit.payment_range"),
                    after:
                      typeof _vm.list.data.price_min !== "undefined" &&
                      typeof _vm.list.data.price_max !== "undefined"
                        ? _vm.list.data.price_min +
                          " - " +
                          _vm.list.data.price_max
                        : ""
                  },
                  on: { click: _vm.showPaymentRange }
                }),
                _vm._v(" "),
                _vm.$root.team &&
                _vm.$root.teamMembers &&
                !_vm.list.data.only_assigned
                  ? _c(
                      "f7-list-item",
                      {
                        attrs: {
                          "smart-select": "",
                          "smart-select-params": { searchbar: true },
                          title: _vm.$t(
                            "invoicing.list_edit.assignee",
                            "Assignee"
                          )
                        }
                      },
                      [
                        _c(
                          "select",
                          {
                            attrs: { name: "assignee", multiple: "" },
                            on: { change: _vm.onAssigneeChange }
                          },
                          _vm._l(_vm.$root.teamMembers, function(teamMember) {
                            return _c(
                              "option",
                              {
                                key: teamMember.id,
                                attrs: {
                                  "data-option-class":
                                    "invoicing-smart-select-option",
                                  "data-option-image": teamMember.icon_url
                                },
                                domProps: {
                                  value: teamMember.user_id,
                                  selected:
                                    _vm.list.data.assignee.indexOf(
                                      teamMember.user_id
                                    ) >= 0
                                }
                              },
                              [
                                _vm._v(
                                  _vm._s(teamMember.first_name || "") +
                                    " " +
                                    _vm._s(teamMember.last_name || "")
                                )
                              ]
                            )
                          }),
                          0
                        )
                      ]
                    )
                  : _vm._e(),
                _vm._v(" "),
                _vm.contacts
                  ? _c(
                      "f7-list-item",
                      {
                        attrs: {
                          "smart-select": "",
                          "smart-select-params": { searchbar: true },
                          title: _vm.$t(
                            "invoicing.list_edit.customer",
                            "Customer"
                          )
                        }
                      },
                      [
                        _c(
                          "select",
                          {
                            attrs: { name: "customer", multiple: "" },
                            on: { change: _vm.onCustomerChange }
                          },
                          _vm._l(_vm.contacts, function(contact, contactIndex) {
                            return _c(
                              "option",
                              {
                                key:
                                  contactIndex +
                                  "-" +
                                  contact.id +
                                  "-" +
                                  contact.friend_id,
                                attrs: {
                                  "data-option-class":
                                    "invoicing-smart-select-option",
                                  "data-option-image": contact.icon_url
                                },
                                domProps: {
                                  value: contact.friend_id,
                                  selected:
                                    _vm.list.data.customer.indexOf(
                                      contact.friend_id
                                    ) >= 0
                                }
                              },
                              [
                                _vm._v(
                                  _vm._s(
                                    contact.name ||
                                      (contact.first_name || "") +
                                        " " +
                                        (contact.last_name || "")
                                  )
                                )
                              ]
                            )
                          }),
                          0
                        )
                      ]
                    )
                  : _vm._e(),
                _vm._v(" "),
                _c(
                  "f7-list-item",
                  {
                    attrs: {
                      title: _vm.$t(
                        "invoicing.list_edit.only_assigned",
                        "Show only assigned"
                      )
                    }
                  },
                  [
                    _c("f7-toggle", {
                      attrs: {
                        slot: "after",
                        checked: !!_vm.list.data.only_assigned
                      },
                      on: {
                        change: function($event) {
                          return _vm.setOnlyAssigned($event.target.checked)
                        }
                      },
                      slot: "after"
                    })
                  ],
                  1
                ),
                _vm._v(" "),
                _vm._l(_vm.permissions, function(permission, index) {
                  return _c("tag-select", {
                    key: index,
                    attrs: {
                      listId: _vm.list.id,
                      data: {
                        title: _vm.$t(
                          "invoicing.permissions." + permission.name + ".title"
                        ),
                        placeholder: _vm.$t(
                          "invoicing.common.search_members_tags",
                          "Search Members, Tags"
                        ),
                        pageTitle: _vm.$t(
                          "invoicing.common.search_members_tags",
                          "Search Members, Tags"
                        ),
                        tags: permission.filters
                      }
                    },
                    on: {
                      tagAdd: function(tag) {
                        return _vm.addListPermission(permission, tag)
                      },
                      tagRemove: function(tag) {
                        return _vm.removeListPermission(permission, tag)
                      }
                    }
                  })
                })
              ],
              2
            )
          : _vm._e(),
        _vm._v(" "),
        _vm.list
          ? _c(
              "f7-list",
              { staticClass: "margin-top" },
              [
                _c(
                  "f7-list-button",
                  {
                    staticClass: "color-custom",
                    attrs: { color: "custom" },
                    on: { click: _vm.deleteList }
                  },
                  [
                    _vm._v(
                      _vm._s(
                        _vm.$t("invoicing.list_edit.delete-list", "Delete List")
                      )
                    )
                  ]
                )
              ],
              1
            )
          : _vm._e()
      ],
      1
    )
  };
  var __vue_staticRenderFns__$6 = [];
  __vue_render__$6._withStripped = true;

    /* style */
    var __vue_inject_styles__$6 = undefined;
    /* scoped */
    var __vue_scope_id__$6 = undefined;
    /* module identifier */
    var __vue_module_identifier__$6 = undefined;
    /* functional template */
    var __vue_is_functional_template__$6 = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var ListEditPage = normalizeComponent_1(
      { render: __vue_render__$6, staticRenderFns: __vue_staticRenderFns__$6 },
      __vue_inject_styles__$6,
      __vue_script__$6,
      __vue_scope_id__$6,
      __vue_is_functional_template__$6,
      __vue_module_identifier__$6,
      undefined,
      undefined
    );

  //

  var script$7 = {
    props: {
      list: Object,
    },
    data: function data() {
      var self = this;
      var list = self.list;
      var range = list.data.date_range;
      return {
        showSave: false,
        dateFrom: Array.isArray(range) && range[0] ? range[0] : new Date().getTime(),
        dateTo: Array.isArray(range) && range[1] ? range[1] : new Date().getTime(),
        range: range,
      };
    },
    computed: {
      isCustomRange: function isCustomRange() {
        var range = this.range;
        return Array.isArray(range) || !(!range || typeof range === 'string');
      },
    },
    mounted: function mounted() {
      var self = this;
      var fromInitialChange = false;
      var toInitialChange = false;
      self.calendarFrom = self.$f7.calendar.create({
        inputEl: self.$$(self.$refs.rangeStart.$el).find('input'),
        closeOnSelect: true,
        value: [self.dateFrom],
        on: {
          change: function change(calendar, values) {
            if (fromInitialChange) {
              self.showSave = true;
            }
            fromInitialChange = true;
            self.dateFrom = new Date(values[0]).getTime();
            if (Array.isArray(self.range) && self.range[0]) { self.range[0] = self.dateFrom; }
            if (self.dateFrom > self.dateTo) {
              self.calendarTo.setValue([self.dateFrom]);
            }
          },
        },
      });
      self.calendarTo = self.$f7.calendar.create({
        inputEl: self.$$(self.$refs.rangeEnd.$el).find('input'),
        closeOnSelect: true,
        value: [self.dateTo],
        on: {
          change: function change(calendar, values) {
            if (toInitialChange) {
              self.showSave = true;
            }
            toInitialChange = true;
            self.dateTo = new Date(values[0]).getTime();
            if (Array.isArray(self.range) && self.range[1]) { self.range[1] = self.dateTo; }
            if (self.dateTo < self.dateFrom) {
              self.calendarFrom.setValue([self.dateTo]);
            }
          },
        },
      });
    },
    methods: {
      setPlainRange: function setPlainRange(range) {
        var self = this;
        self.range = range;
        self.showSave = true;
      },
      toggleCustomRange: function toggleCustomRange(isCustom) {
        var self = this;
        self.showSave = true;
        if (isCustom) {
          self.range = [self.dateFrom, self.dateTo];
        } else {
          self.range = '';
        }
      },
      save: function save() {
        var self = this;
        if (self.saving) { return; }
        self.saving = true;
        self.showSave = false;
        var newList = Object.assign({}, self.list);
        newList.data.date_range = self.range;
        API.saveList(newList).then(function () {
          self.$events.$emit('invoicing:setListDateRange', self.list.id, self.range);
          self.$f7router.back();
        });
      },
    },
  };

  /* script */
  var __vue_script__$7 = script$7;

  /* template */
  var __vue_render__$7 = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-page",
      {
        staticClass: "invoicing-page",
        attrs: {
          name: "invoicing__date-range-select",
          id: "invoicing__date-range-select"
        }
      },
      [
        _c(
          "f7-navbar",
          [
            _c("tommy-nav-back"),
            _vm._v(" "),
            _c("f7-nav-title", [
              _vm._v(_vm._s(_vm.$t("invoicing.common.date_range", "Date Range")))
            ]),
            _vm._v(" "),
            _c(
              "f7-nav-right",
              [
                _vm.showSave
                  ? _c("f7-link", {
                      attrs: { "icon-f7": "check" },
                      on: { click: _vm.save }
                    })
                  : _vm._e()
              ],
              1
            )
          ],
          1
        ),
        _vm._v(" "),
        _c(
          "f7-list",
          [
            _c("f7-list-item", {
              attrs: {
                radio: "",
                value: "",
                checked: !_vm.isCustomRange && (_vm.range === "" || !_vm.range),
                title: _vm.$t("invoicing.date_range.none", "None")
              },
              on: {
                change: function($event) {
                  return _vm.setPlainRange("")
                }
              }
            }),
            _vm._v(" "),
            _c("f7-list-item", {
              attrs: {
                radio: "",
                value: "today",
                checked: !_vm.isCustomRange && _vm.range === "today",
                title: _vm.$t("invoicing.date_range.today", "Today")
              },
              on: {
                change: function($event) {
                  return _vm.setPlainRange("today")
                }
              }
            }),
            _vm._v(" "),
            _c("f7-list-item", {
              attrs: {
                radio: "",
                value: "week",
                checked: !_vm.isCustomRange && _vm.range === "week",
                title: _vm.$t("invoicing.date_range.week", "This Week")
              },
              on: {
                change: function($event) {
                  return _vm.setPlainRange("week")
                }
              }
            }),
            _vm._v(" "),
            _c("f7-list-item", {
              attrs: {
                radio: "",
                value: "month",
                checked: !_vm.isCustomRange && _vm.range === "month",
                title: _vm.$t("invoicing.date_range.month", "This Month")
              },
              on: {
                change: function($event) {
                  return _vm.setPlainRange("month")
                }
              }
            })
          ],
          1
        ),
        _vm._v(" "),
        _c(
          "f7-list",
          { staticClass: "top-10 list-custom" },
          [
            _c(
              "f7-list-item",
              {
                attrs: {
                  title: _vm.$t("invoicing.common.choose_range", "Choose Range")
                }
              },
              [
                _c("f7-toggle", {
                  attrs: { slot: "after", checked: _vm.isCustomRange },
                  on: {
                    change: function($event) {
                      return _vm.toggleCustomRange($event.target.checked)
                    }
                  },
                  slot: "after"
                })
              ],
              1
            ),
            _vm._v(" "),
            _c(
              "f7-list-item",
              {
                directives: [
                  {
                    name: "show",
                    rawName: "v-show",
                    value: _vm.isCustomRange,
                    expression: "isCustomRange"
                  }
                ]
              },
              [
                _c("f7-label", [
                  _vm._v(
                    _vm._s(_vm.$t("invoicing.common.start_date", "Start Date"))
                  )
                ]),
                _vm._v(" "),
                _c("f7-input", { ref: "rangeStart", attrs: { type: "text" } })
              ],
              1
            ),
            _vm._v(" "),
            _c(
              "f7-list-item",
              {
                directives: [
                  {
                    name: "show",
                    rawName: "v-show",
                    value: _vm.isCustomRange,
                    expression: "isCustomRange"
                  }
                ]
              },
              [
                _c("f7-label", [
                  _vm._v(_vm._s(_vm.$t("invoicing.common.end_date", "End Date")))
                ]),
                _vm._v(" "),
                _c("f7-input", { ref: "rangeEnd", attrs: { type: "text" } })
              ],
              1
            )
          ],
          1
        )
      ],
      1
    )
  };
  var __vue_staticRenderFns__$7 = [];
  __vue_render__$7._withStripped = true;

    /* style */
    var __vue_inject_styles__$7 = undefined;
    /* scoped */
    var __vue_scope_id__$7 = undefined;
    /* module identifier */
    var __vue_module_identifier__$7 = undefined;
    /* functional template */
    var __vue_is_functional_template__$7 = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var DateRangePage = normalizeComponent_1(
      { render: __vue_render__$7, staticRenderFns: __vue_staticRenderFns__$7 },
      __vue_inject_styles__$7,
      __vue_script__$7,
      __vue_scope_id__$7,
      __vue_is_functional_template__$7,
      __vue_module_identifier__$7,
      undefined,
      undefined
    );

  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //

  var script$8 = {
    props: {
      listId: [String, Number],
      pageTitle: String,
      tags: Array,
      teamTags: Array,
      onChange: Function,
    },
    data: function data() {
      return {
        query: null,
      };
    },
    computed: {
      allTags: function allTags() {
        var self = this;
        var addTags = [];
        self.tags.forEach(function (f) {
          var isTeamTag;
          self.teamTags.forEach(function (t) {
            if (isTeamTag) { return; }
            isTeamTag = f.context === t.context && f.name === t.name && f.label === t.label;
          });
          if (!isTeamTag) { addTags.push(f); }
        });
        return ( self.teamTags ).concat( addTags);
      },
    },
    methods: {
      onSearch: function onSearch(sb, query) {
        var self = this;
        self.query = query;
      },
      isTagSelected: function isTagSelected(tag) {
        var self = this;
        return self.tags.filter(function (t) { return t.name === tag.name && t.id === tag.id && t.type === tag.type; }).length > 0;
      },
      contextIconSrc: function contextIconSrc(tag) {
        var self = this;
        var $addonAssetsUrl = self.$addonAssetsUrl;
        return ($addonAssetsUrl + "icons/" + (tag.context.slice(0, -1)) + ".png");
      },
      contextIconSrcset: function contextIconSrcset(tag) {
        var self = this;
        var $addonAssetsUrl = self.$addonAssetsUrl;
        return ($addonAssetsUrl + "icons/" + (tag.context.slice(0, -1)) + "@2x.png 2x," + $addonAssetsUrl + "icons/" + (tag.context.slice(0, -1)) + "@3x.png 3x");
      },
      toggleTag: function toggleTag(tag, selected, close) {
        var self = this;
        if (self.onChange) {
          self.onChange(tag, selected);
          if (close) {
            self.$f7router.back();
          }
        }
      },
    },
  };

  /* script */
  var __vue_script__$8 = script$8;

  /* template */
  var __vue_render__$8 = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-page",
      { staticClass: "invoicing-page" },
      [
        _c(
          "f7-navbar",
          [
            _c("tommy-nav-back"),
            _vm._v(" "),
            _c("f7-nav-title", [_vm._v(_vm._s(_vm.pageTitle))]),
            _vm._v(" "),
            _c(
              "f7-subnavbar",
              { attrs: { inner: false } },
              [
                _c("f7-searchbar", {
                  attrs: {
                    "search-container": "#list-edit-tag-select",
                    "search-in": ".item-title"
                  },
                  on: { "searchbar:search": _vm.onSearch }
                })
              ],
              1
            )
          ],
          1
        ),
        _vm._v(" "),
        _vm.query && _vm.query.length
          ? _c(
              "f7-list",
              [
                _c(
                  "f7-list-item",
                  {
                    staticClass: "tasks-tag-select-tags-list",
                    attrs: { checkbox: "", title: _vm.query },
                    on: {
                      change: function($event) {
                        return _vm.toggleTag(
                          { context: "tags", name: _vm.query, label: "Tag" },
                          $event.target.checked,
                          true
                        )
                      }
                    }
                  },
                  [
                    _c(
                      "span",
                      {
                        staticClass: "tag-select-list-icon",
                        attrs: { slot: "media" },
                        slot: "media"
                      },
                      [
                        _c("img", {
                          attrs: {
                            src: _vm.contextIconSrc({
                              context: "tags",
                              name: _vm.query,
                              label: "Tag"
                            }),
                            srcset: _vm.contextIconSrcset({
                              context: "tags",
                              name: _vm.query,
                              label: "Tag"
                            })
                          }
                        })
                      ]
                    )
                  ]
                )
              ],
              1
            )
          : _vm._e(),
        _vm._v(" "),
        _c(
          "f7-list",
          {
            staticClass: "no-margin no-hairlines tasks-tag-select-tags-list",
            attrs: { id: "list-edit-tag-select" }
          },
          _vm._l(_vm.allTags, function(tag, index) {
            return _c(
              "f7-list-item",
              {
                key: index,
                attrs: {
                  checkbox: "",
                  checked: _vm.isTagSelected(tag),
                  title: tag.name
                },
                on: {
                  change: function($event) {
                    return _vm.toggleTag(tag, $event.target.checked)
                  }
                }
              },
              [
                tag.context === "members"
                  ? _c("span", {
                      staticClass: "tag-select-list-avatar",
                      style: "background-image: url(" + (tag.icon || "") + ")",
                      attrs: { slot: "media" },
                      slot: "media"
                    })
                  : _c(
                      "span",
                      {
                        staticClass: "tag-select-list-icon",
                        attrs: { slot: "media" },
                        slot: "media"
                      },
                      [
                        _c("img", {
                          attrs: {
                            src: _vm.contextIconSrc(tag),
                            srcset: _vm.contextIconSrcset(tag)
                          }
                        })
                      ]
                    )
              ]
            )
          }),
          1
        )
      ],
      1
    )
  };
  var __vue_staticRenderFns__$8 = [];
  __vue_render__$8._withStripped = true;

    /* style */
    var __vue_inject_styles__$8 = undefined;
    /* scoped */
    var __vue_scope_id__$8 = undefined;
    /* module identifier */
    var __vue_module_identifier__$8 = undefined;
    /* functional template */
    var __vue_is_functional_template__$8 = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var TagSelectPage = normalizeComponent_1(
      { render: __vue_render__$8, staticRenderFns: __vue_staticRenderFns__$8 },
      __vue_inject_styles__$8,
      __vue_script__$8,
      __vue_scope_id__$8,
      __vue_is_functional_template__$8,
      __vue_module_identifier__$8,
      undefined,
      undefined
    );

  //

  var script$9 = {
    components: {
      tagSelect: tagSelect,
    },
    props: {
      id: [String, Number],
    },
    data: function data() {
      var self = this;
      return {
        pageTitle: self.$f7route.query.title || self.$t('invoicing.product.new_title'),
        item: null,
        showSave: false,
        imagePreview: null,
        availabile_in: '',
      };
    },
    mounted: function mounted() {
      var self = this;
      if (!self.id) {
        self.item = {
          active: false,
          category: '',
          code: '',
          data: {
            duration: null,
            availabile_in: [],
          },
          filters: [],
          description: '',
          name: '',
          price: 0,
        };
        return;
      }
      API.loadProduct(self.id).then(function (item) {
        if (!item.data || typeof item.data === 'string') {
          item.data = {
            duration: null,
            availabile_in: [],
          };
        }
        self.availabile_in = (item.data.availabile_in || []).join(',');
        if (typeof item.filters === 'string') { item.filters = JSON.parse(decodeURIComponent(item.filters)); }
        if (!item.filters) { item.filters = []; }
        self.item = item;
      });
    },
    methods: {
      setAvailable: function setAvailable(value) {
        var self = this;
        self.availabile_in = value;
        self.item.data.availabile_in = value.split(',').map(function (el) { return el.trim(); }).filter(function (el) { return el; });
        self.enableSave();
      },
      setPrice: function setPrice(value) {
        var self = this;
        self.item.price = value;
        self.item.price_cents = parseFloat(self.item.price) * 100;
        if (Number.isNaN(self.item.price_cents)) { self.item.price_cents = 0; }
        self.enableSave();
      },
      enableSave: function enableSave() {
        var self = this;
        if (!self.item.name) {
          self.showSave = false;
          return;
        }
        self.showSave = true;
      },
      addItemTag: function addItemTag(tag) {
        var self = this;
        self.item.filters.push(tag);
        self.enableSave();
      },
      removeItemTag: function removeItemTag(tag) {
        var self = this;
        self.item.filters.splice(self.item.filters.indexOf(tag), 1);
        self.enableSave();
      },
      onDurationChange: function onDurationChange(e) {
        var self = this;
        self.item.data.duration = e.target.value;
        self.enableSave();
      },
      onFileChange: function onFileChange(e) {
        var self = this;
        var file = e.target.files[0];
        var reader = new FileReader();
        reader.onload = function (ev) {
          self.imagePreview = ev.target.result;
        };
        reader.readAsDataURL(file);
        self.item.image = file;
        self.enableSave();
      },
      deleteImage: function deleteImage() {
        var self = this;
        self.item.image = null;
        self.item.image_url = null;
        self.imagePreview = null;
        self.enableSave();
      },
      save: function save() {
        var self = this;
        self.showSave = false;
        API.saveProduct(self.item).then(function () {
          self.$events.$emit('invoicing:reloadProducts');
          self.$f7router.back();
        });
      },
    },
  };

  /* script */
  var __vue_script__$9 = script$9;

  /* template */
  var __vue_render__$9 = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-page",
      {
        staticClass: "invoicing-page",
        attrs: {
          id: "invoicing__item-details",
          "data-name": "invoicing__item-details"
        }
      },
      [
        _c(
          "f7-navbar",
          [
            _c("tommy-nav-back"),
            _vm._v(" "),
            _c("f7-nav-title", [_vm._v(_vm._s(_vm.pageTitle))]),
            _vm._v(" "),
            _c(
              "f7-nav-right",
              [
                _vm.showSave
                  ? _c("f7-link", {
                      attrs: { "icon-f7": "check" },
                      on: { click: _vm.save }
                    })
                  : _vm._e()
              ],
              1
            )
          ],
          1
        ),
        _vm._v(" "),
        _vm.item
          ? _c(
              "f7-list",
              { staticClass: "list-custom" },
              [
                _c("f7-list-input", {
                  attrs: {
                    label: _vm.$t("invoicing.item.name_label", "Name"),
                    placeholder: _vm.$t(
                      "invoicing.item.name_placeholder",
                      "Enter item/service name"
                    ),
                    type: "text",
                    value: _vm.item.name
                  },
                  on: {
                    input: function($event) {
                      _vm.item.name = $event.target.value;
                      _vm.enableSave();
                    }
                  }
                }),
                _vm._v(" "),
                _c(
                  "f7-list-item",
                  {
                    attrs: {
                      title: _vm.$t("invoicing.item.enabled_label", "Enabled")
                    }
                  },
                  [
                    _c("f7-toggle", {
                      attrs: { checked: _vm.item.active },
                      on: {
                        change: function($event) {
                          _vm.item.active = $event.target.checked;
                          _vm.enableSave();
                        }
                      }
                    })
                  ],
                  1
                ),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t(
                      "invoicing.item.description_label",
                      "Description"
                    )
                  }
                }),
                _vm._v(" "),
                _c("f7-list-input", {
                  attrs: {
                    placeholder: _vm.$t(
                      "invoicing.item.description_placeholder",
                      "Enter item/service description"
                    ),
                    type: "textarea",
                    resizable: "",
                    value: _vm.item.description
                  },
                  on: {
                    input: function($event) {
                      _vm.item.description = $event.target.value;
                      _vm.enableSave();
                    }
                  }
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t("invoicing.item.duration_label", "Duration")
                  }
                }),
                _vm._v(" "),
                _c("f7-list-input", {
                  attrs: {
                    placeholder: _vm.$t(
                      "invoicing.item.duration_placeholder",
                      "Item duration in minutes"
                    ),
                    type: "number",
                    value: _vm.item.data.duration
                  },
                  on: { input: _vm.onDurationChange }
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t("invoicing.item.category_label", "Category")
                  }
                }),
                _vm._v(" "),
                _c("f7-list-input", {
                  attrs: {
                    placeholder: _vm.$t(
                      "invoicing.item.category_placeholder",
                      "Enter item/service category"
                    ),
                    type: "text",
                    value: _vm.item.category
                  },
                  on: {
                    input: function($event) {
                      _vm.item.category = $event.target.value;
                      _vm.enableSave();
                    }
                  }
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t(
                      "invoicing.item.available_in_label",
                      "Available in"
                    )
                  }
                }),
                _vm._v(" "),
                _c("f7-list-input", {
                  attrs: {
                    placeholder: _vm.$t(
                      "invoicing.item.available_in_placeholder",
                      "City where it is available"
                    ),
                    type: "text",
                    value: _vm.availabile_in
                  },
                  on: {
                    input: function($event) {
                      return _vm.setAvailable($event.target.value)
                    }
                  }
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t("invoicing.item.photo_label", "Photo")
                  }
                }),
                _vm._v(" "),
                _c("li", [
                  _c(
                    "div",
                    { staticClass: "invoicing-product-photo-container" },
                    [
                      _vm.item.image_url || _vm.imagePreview
                        ? _c(
                            "div",
                            { staticClass: "invoicing-product-photo" },
                            [
                              _c("img", {
                                attrs: {
                                  src: _vm.item.image_url || _vm.imagePreview
                                }
                              }),
                              _vm._v(" "),
                              _c("f7-link", {
                                attrs: { "icon-f7": "close_round_fill" },
                                on: { click: _vm.deleteImage }
                              })
                            ],
                            1
                          )
                        : _c(
                            "label",
                            { staticClass: "invoicing-product-photo-add" },
                            [
                              _c("input", {
                                attrs: { type: "file" },
                                on: { change: _vm.onFileChange }
                              }),
                              _vm._v(" "),
                              _c("f7-icon", { attrs: { f7: "add" } })
                            ],
                            1
                          )
                    ]
                  )
                ]),
                _vm._v(" "),
                _c("tag-select", {
                  attrs: {
                    slot: "after-list",
                    data: {
                      title: _vm.$t("invoicing.item.tags_label"),
                      placeholder: _vm.$t(
                        "invoicing.common.search_members_tags",
                        "Search Members, Tags"
                      ),
                      pageTitle: _vm.$t(
                        "invoicing.common.search_members_tags",
                        "Search Members, Tags"
                      ),
                      tags: _vm.item.filters
                    }
                  },
                  on: { tagAdd: _vm.addItemTag, tagRemove: _vm.removeItemTag },
                  slot: "after-list"
                })
              ],
              1
            )
          : _vm._e(),
        _vm._v(" "),
        _vm.item
          ? _c(
              "f7-list",
              { staticClass: "list-custom margin-top" },
              [
                _c("f7-list-input", {
                  attrs: {
                    label: _vm.$t("invoicing.item.price_label", "Price"),
                    placeholder: _vm.$t(
                      "invoicing.item.price_placeholder",
                      "Enter item/service price"
                    ),
                    type: "number",
                    value: _vm.item.price
                  },
                  on: {
                    input: function($event) {
                      return _vm.setPrice($event.target.value)
                    }
                  }
                }),
                _vm._v(" "),
                _c("f7-list-input", {
                  attrs: {
                    label: _vm.$t("invoicing.item.barcode_label", "Barcode ID"),
                    placeholder: _vm.$t(
                      "invoicing.item.barcode_placeholder",
                      "Enter item/service barcode ID"
                    ),
                    type: "text",
                    value: _vm.item.code
                  },
                  on: {
                    input: function($event) {
                      _vm.item.code = $event.target.value;
                      _vm.enableSave();
                    }
                  }
                })
              ],
              1
            )
          : _vm._e()
      ],
      1
    )
  };
  var __vue_staticRenderFns__$9 = [];
  __vue_render__$9._withStripped = true;

    /* style */
    var __vue_inject_styles__$9 = undefined;
    /* scoped */
    var __vue_scope_id__$9 = undefined;
    /* module identifier */
    var __vue_module_identifier__$9 = undefined;
    /* functional template */
    var __vue_is_functional_template__$9 = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var ProductDetailsPage = normalizeComponent_1(
      { render: __vue_render__$9, staticRenderFns: __vue_staticRenderFns__$9 },
      __vue_inject_styles__$9,
      __vue_script__$9,
      __vue_scope_id__$9,
      __vue_is_functional_template__$9,
      __vue_module_identifier__$9,
      undefined,
      undefined
    );

  //

  var script$a = {
    components: {
      tagSelect: tagSelect,
    },
    props: {
      id: [String, Number],
    },
    data: function data() {
      var self = this;
      return {
        pageTitle: self.$f7route.query.title || self.$t('invoicing.package.new_title'),
        item: null,
        showSave: false,
        imagePreview: null,
        products: null,
        productsOpened: false,
        availabile_in: '',
        data: {
          duration: null,
        },
      };
    },
    mounted: function mounted() {
      var self = this;
      API.loadProducts().then(function (products) {
        self.products = products;
      });
      if (!self.id) {
        self.item = {
          active: false,
          category: '',
          code: '',
          filters: [],
          description: '',
          name: '',
          price: 0,
          vendor_package_products_attributes: [],
          data: {
            availabile_in: [],
            duration: null,
          },
        };
        return;
      }
      API.loadPackage(self.id).then(function (item) {
        if (!item.vendor_package_products_attributes) { item.vendor_package_products_attributes = []; }
        if (item.vendor_package_products) {
          item.vendor_package_products_attributes = item.vendor_package_products.map(function (el) {
            return {
              id: el.id,
              vendor_product_id: el.vendor_product_id,
              quantity: el.quantity,
              vendor_package_id: el.vendor_package_id,
            };
          });
          delete item.vendor_package_products;
        }
        if (!item.data || typeof item.data === 'string') {
          item.data = {
            availabile_in: [],
            duration: null,
          };
        }
        self.availabile_in = (item.data.availabile_in || []).join(',');
        if (typeof item.filters === 'string') { item.filters = JSON.parse(decodeURIComponent(item.filters)); }
        if (!item.filters) { item.filters = []; }
        self.item = item;
      });
    },
    methods: {
      setAvailable: function setAvailable(value) {
        var self = this;
        self.availabile_in = value;
        self.item.data.availabile_in = value.split(',').map(function (el) { return el.trim(); }).filter(function (el) { return el; });
        self.enableSave();
      },
      productName: function productName(id) {
        var self = this;
        return self.products.filter(function (el) { return el.id === parseInt(id, 10); })[0].name;
      },
      increaseProduct: function increaseProduct(index) {
        var self = this;
        self.item.vendor_package_products_attributes[index].quantity += 1;
        self.enableSave();
      },
      decreaseProduct: function decreaseProduct(index) {
        var self = this;
        self.item.vendor_package_products_attributes[index].quantity -= 1;
        if (self.item.vendor_package_products_attributes[index].quantity === 0) {
          if (self.item.vendor_package_products_attributes[index].id) {
            self.item.vendor_package_products_attributes[index]._destroy = true;
          } else {
            self.item.vendor_package_products_attributes.splice(index, 1);
          }
        }
        self.enableSave();
      },
      addProduct: function addProduct(product) {
        var self = this;
        self.productsOpened = false;
        var hasProduct;
        self.item.vendor_package_products_attributes.forEach(function (el) {
          if (el.vendor_product_id === product.id) { hasProduct = true; }
        });
        if (hasProduct) { return; }

        self.item.vendor_package_products_attributes.push({
          vendor_product_id: product.id,
          quantity: 1,
        });
        self.showSave = true;
      },
      setPrice: function setPrice(value) {
        var self = this;
        self.item.price = value;
        self.item.price_cents = parseFloat(self.item.price) * 100;
        if (Number.isNaN(self.item.price_cents)) { self.item.price_cents = 0; }
        self.enableSave();
      },
      enableSave: function enableSave() {
        var self = this;
        if (!self.item.name) {
          self.showSave = false;
          return;
        }
        self.showSave = true;
      },
      addItemTag: function addItemTag(tag) {
        var self = this;
        self.item.filters.push(tag);
        self.enableSave();
      },
      removeItemTag: function removeItemTag(tag) {
        var self = this;
        self.item.filters.splice(self.item.filters.indexOf(tag), 1);
        self.enableSave();
      },
      onDurationChange: function onDurationChange(e) {
        var self = this;
        self.item.data.duration = e.target.value;
        self.enableSave();
      },
      onFileChange: function onFileChange(e) {
        var self = this;
        var file = e.target.files[0];
        var reader = new FileReader();
        reader.onload = function (ev) {
          self.imagePreview = ev.target.result;
        };
        reader.readAsDataURL(file);
        self.item.image = file;
        self.enableSave();
      },
      deleteImage: function deleteImage() {
        var self = this;
        self.item.image = null;
        self.item.image_url = null;
        self.imagePreview = null;
        self.enableSave();
      },
      save: function save() {
        var self = this;
        self.showSave = false;
        API.saveProduct(self.item, true).then(function () {
          self.$events.$emit('invoicing:reloadPackages');
          self.$f7router.back();
        });
      },
    },
  };

  /* script */
  var __vue_script__$a = script$a;

  /* template */
  var __vue_render__$a = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-page",
      {
        staticClass: "invoicing-page",
        attrs: {
          id: "invoicing__item-details",
          "data-name": "invoicing__item-details"
        }
      },
      [
        _c(
          "f7-navbar",
          [
            _c("tommy-nav-back"),
            _vm._v(" "),
            _c("f7-nav-title", [_vm._v(_vm._s(_vm.pageTitle))]),
            _vm._v(" "),
            _c(
              "f7-nav-right",
              [
                _vm.showSave
                  ? _c("f7-link", {
                      attrs: { "icon-f7": "check" },
                      on: { click: _vm.save }
                    })
                  : _vm._e()
              ],
              1
            )
          ],
          1
        ),
        _vm._v(" "),
        _vm.item
          ? _c(
              "f7-list",
              { staticClass: "list-custom" },
              [
                _c("f7-list-input", {
                  attrs: {
                    label: _vm.$t("invoicing.item.name_label", "Name"),
                    placeholder: _vm.$t(
                      "invoicing.item.name_placeholder",
                      "Enter item/service name"
                    ),
                    type: "text",
                    value: _vm.item.name
                  },
                  on: {
                    input: function($event) {
                      _vm.item.name = $event.target.value;
                      _vm.enableSave();
                    }
                  }
                }),
                _vm._v(" "),
                _c(
                  "f7-list-item",
                  {
                    attrs: {
                      title: _vm.$t("invoicing.item.enabled_label", "Enabled")
                    }
                  },
                  [
                    _c("f7-toggle", {
                      attrs: { checked: _vm.item.active },
                      on: {
                        change: function($event) {
                          _vm.item.active = $event.target.checked;
                          _vm.enableSave();
                        }
                      }
                    })
                  ],
                  1
                ),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t(
                      "invoicing.item.description_label",
                      "Description"
                    )
                  }
                }),
                _vm._v(" "),
                _c("f7-list-input", {
                  attrs: {
                    placeholder: _vm.$t(
                      "invoicing.item.description_placeholder",
                      "Enter item/service description"
                    ),
                    type: "textarea",
                    resizable: "",
                    value: _vm.item.description
                  },
                  on: {
                    input: function($event) {
                      _vm.item.description = $event.target.value;
                      _vm.enableSave();
                    }
                  }
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t("invoicing.item.duration_label", "Duration")
                  }
                }),
                _vm._v(" "),
                _c("f7-list-input", {
                  attrs: {
                    placeholder: _vm.$t(
                      "invoicing.item.duration_placeholder",
                      "Item duration in minutes"
                    ),
                    type: "number",
                    value: _vm.item.data.duration
                  },
                  on: { input: _vm.onDurationChange }
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t("invoicing.item.category_label", "Cagegory")
                  }
                }),
                _vm._v(" "),
                _c("f7-list-input", {
                  attrs: {
                    placeholder: _vm.$t(
                      "invoicing.item.category_placeholder",
                      "Enter item/service category"
                    ),
                    type: "text",
                    value: _vm.item.category
                  },
                  on: {
                    input: function($event) {
                      _vm.item.category = $event.target.value;
                      _vm.enableSave();
                    }
                  }
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t(
                      "invoicing.item.available_in_label",
                      "Available in"
                    )
                  }
                }),
                _vm._v(" "),
                _c("f7-list-input", {
                  attrs: {
                    placeholder: _vm.$t(
                      "invoicing.item.available_in_placeholder",
                      "City where it is available"
                    ),
                    type: "text",
                    value: _vm.availabile_in
                  },
                  on: {
                    input: function($event) {
                      return _vm.setAvailable($event.target.value)
                    }
                  }
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t("invoicing.item.photo_label", "Photo")
                  }
                }),
                _vm._v(" "),
                _c("li", [
                  _c(
                    "div",
                    { staticClass: "invoicing-product-photo-container" },
                    [
                      _vm.item.image_url || _vm.imagePreview
                        ? _c(
                            "div",
                            { staticClass: "invoicing-product-photo" },
                            [
                              _c("img", {
                                attrs: {
                                  src: _vm.item.image_url || _vm.imagePreview
                                }
                              }),
                              _vm._v(" "),
                              _c("f7-link", {
                                attrs: { "icon-f7": "close_round_fill" },
                                on: { click: _vm.deleteImage }
                              })
                            ],
                            1
                          )
                        : _c(
                            "label",
                            { staticClass: "invoicing-product-photo-add" },
                            [
                              _c("input", {
                                attrs: { type: "file" },
                                on: { change: _vm.onFileChange }
                              }),
                              _vm._v(" "),
                              _c("f7-icon", { attrs: { f7: "add" } })
                            ],
                            1
                          )
                    ]
                  )
                ]),
                _vm._v(" "),
                _c("tag-select", {
                  attrs: {
                    slot: "after-list",
                    data: {
                      title: _vm.$t("invoicing.item.tags_label"),
                      placeholder: _vm.$t(
                        "invoicing.common.search_members_tags",
                        "Search Members, Tags"
                      ),
                      pageTitle: _vm.$t(
                        "invoicing.common.search_members_tags",
                        "Search Members, Tags"
                      ),
                      tags: _vm.item.filters
                    }
                  },
                  on: { tagAdd: _vm.addItemTag, tagRemove: _vm.removeItemTag },
                  slot: "after-list"
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t("invoicing.package.items_label")
                  }
                }),
                _vm._v(" "),
                _vm.products
                  ? _c(
                      "li",
                      { staticClass: "invoicing-order-items" },
                      [
                        _c(
                          "div",
                          {
                            staticClass: "invoicing-order-add-box",
                            on: {
                              click: function($event) {
                                _vm.productsOpened = true;
                              }
                            }
                          },
                          [
                            _c("f7-icon", { attrs: { f7: "add" } }),
                            _vm._v(" "),
                            _c(
                              "div",
                              {
                                staticClass: "invoicing-order-add-box-placeholder"
                              },
                              [
                                _vm._v(
                                  _vm._s(
                                    _vm.$t("invoicing.package.add_item_label")
                                  )
                                )
                              ]
                            )
                          ],
                          1
                        ),
                        _vm._v(" "),
                        _vm._l(
                          _vm.item.vendor_package_products_attributes,
                          function(product, index) {
                            return !product._destroy
                              ? _c(
                                  "div",
                                  {
                                    key: index,
                                    staticClass: "invoicing-order-item"
                                  },
                                  [
                                    _c(
                                      "div",
                                      {
                                        staticClass: "invoicing-order-item-name"
                                      },
                                      [
                                        _vm._v(
                                          _vm._s(
                                            _vm.productName(
                                              product.vendor_product_id
                                            )
                                          )
                                        )
                                      ]
                                    ),
                                    _vm._v(" "),
                                    _c(
                                      "div",
                                      {
                                        staticClass:
                                          "invoicing-order-item-selector"
                                      },
                                      [
                                        _c("f7-link", {
                                          attrs: { "icon-f7": "delete_round" },
                                          on: {
                                            click: function($event) {
                                              return _vm.decreaseProduct(index)
                                            }
                                          }
                                        }),
                                        _vm._v(" "),
                                        _c(
                                          "div",
                                          {
                                            staticClass:
                                              "invoicing-order-item-qty"
                                          },
                                          [_vm._v(_vm._s(product.quantity))]
                                        ),
                                        _vm._v(" "),
                                        _c("f7-link", {
                                          attrs: { "icon-f7": "add_round_fill" },
                                          on: {
                                            click: function($event) {
                                              return _vm.increaseProduct(index)
                                            }
                                          }
                                        })
                                      ],
                                      1
                                    )
                                  ]
                                )
                              : _vm._e()
                          }
                        )
                      ],
                      2
                    )
                  : _vm._e()
              ],
              1
            )
          : _vm._e(),
        _vm._v(" "),
        _vm.item
          ? _c(
              "f7-list",
              { staticClass: "list-custom margin-top" },
              [
                _c("f7-list-input", {
                  attrs: {
                    label: _vm.$t("invoicing.item.price_label", "Price"),
                    placeholder: _vm.$t(
                      "invoicing.item.price_placeholder",
                      "Enter item/service price"
                    ),
                    type: "text",
                    value: _vm.item.price
                  },
                  on: {
                    input: function($event) {
                      return _vm.setPrice($event.target.value)
                    }
                  }
                }),
                _vm._v(" "),
                _c("f7-list-input", {
                  attrs: {
                    label: _vm.$t("invoicing.item.barcode_label", "Barcode ID"),
                    placeholder: _vm.$t(
                      "invoicing.item.barcode_placeholder",
                      "Enter item/service barcode ID"
                    ),
                    type: "text",
                    value: _vm.item.code
                  },
                  on: {
                    input: function($event) {
                      _vm.item.code = $event.target.value;
                      _vm.enableSave();
                    }
                  }
                })
              ],
              1
            )
          : _vm._e(),
        _vm._v(" "),
        _vm.products
          ? _c(
              "f7-popup",
              {
                attrs: { opened: _vm.productsOpened },
                on: {
                  "popup:closed": function($event) {
                    _vm.productsOpened = false;
                  }
                }
              },
              [
                _c(
                  "f7-view",
                  { attrs: { init: false } },
                  [
                    _c(
                      "f7-page",
                      { staticClass: "invoicing-page" },
                      [
                        _c(
                          "f7-navbar",
                          [
                            _c(
                              "f7-nav-right",
                              [
                                _c("f7-link", {
                                  attrs: { "popup-close": "", "icon-f7": "close" }
                                })
                              ],
                              1
                            ),
                            _vm._v(" "),
                            _c("f7-nav-title", [
                              _vm._v(
                                _vm._s(_vm.$t("invoicing.package.add_item_label"))
                              )
                            ])
                          ],
                          1
                        ),
                        _vm._v(" "),
                        _c("f7-searchbar", {
                          attrs: {
                            "search-container":
                              ".invoicing-package-details-products",
                            "disable-button": false
                          }
                        }),
                        _vm._v(" "),
                        _c(
                          "f7-list",
                          {
                            staticClass:
                              "list-custom invoicing-order-details-products invoicing-package-details-products"
                          },
                          _vm._l(_vm.products, function(product) {
                            return _c("f7-list-item", {
                              key: product.id,
                              attrs: {
                                link: "",
                                title: product.name,
                                after: "¥" + product.price
                              },
                              on: {
                                click: function($event) {
                                  return _vm.addProduct(product)
                                }
                              }
                            })
                          }),
                          1
                        )
                      ],
                      1
                    )
                  ],
                  1
                )
              ],
              1
            )
          : _vm._e()
      ],
      1
    )
  };
  var __vue_staticRenderFns__$a = [];
  __vue_render__$a._withStripped = true;

    /* style */
    var __vue_inject_styles__$a = undefined;
    /* scoped */
    var __vue_scope_id__$a = undefined;
    /* module identifier */
    var __vue_module_identifier__$a = undefined;
    /* functional template */
    var __vue_is_functional_template__$a = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var PackageDetailsPage = normalizeComponent_1(
      { render: __vue_render__$a, staticRenderFns: __vue_staticRenderFns__$a },
      __vue_inject_styles__$a,
      __vue_script__$a,
      __vue_scope_id__$a,
      __vue_is_functional_template__$a,
      __vue_module_identifier__$a,
      undefined,
      undefined
    );

  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //

  var script$b = {
    props: {
      from: Number,
      to: Number,
      pageTitle: String,
      onSave: Function,
    },
    data: function data() {
      var self = this;
      var amount_min = self.from;
      var amount_max = self.to;
      return {
        showSave: false,
        amount_min: amount_min,
        amount_max: amount_max,
        isCustomRange: (typeof amount_min !== 'undefined' || typeof amount_max !== 'undefined'),
      };
    },
    methods: {
      save: function save() {
        var self = this;
        if (self.saving) { return; }
        self.saving = true;
        self.showSave = false;
        // const newList = Object.assign({}, self.list);
        var amount_min = self.amount_min;
        var amount_max = self.amount_max;
        var from;
        var to;

        if (self.isCustomRange) {
          from = amount_min;
          to = amount_max;
          if (!from) {
            from = undefined;
          }
          if (!to) {
            to = undefined;
          }
          if (amount_min && amount_max && (amount_max < amount_min)) {
            to = amount_min;
          }
        } else {
          from = undefined;
          to = undefined;
        }

        self.onSave({
          from: from,
          to: to,
        });
      },
      setMin: function setMin(value) {
        var self = this;
        self.amount_min = value;
        self.showSave = true;
      },
      setMax: function setMax(value) {
        var self = this;
        self.amount_max = value;
        self.showSave = true;
      },
      toggleCustomRange: function toggleCustomRange(isCustom) {
        var self = this;
        self.showSave = true;
        if (!isCustom) {
          self.isCustomRange = false;
          self.amount_min = undefined;
          self.amount_max = undefined;
        } else {
          self.isCustomRange = true;
          self.amount_min = self.from;
          self.amount_max = self.to;
        }
      },
    },
  };

  /* script */
  var __vue_script__$b = script$b;

  /* template */
  var __vue_render__$b = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-page",
      {
        staticClass: "invoicing-page",
        attrs: { name: "invoicing__range-select", id: "invoicing__range-select" }
      },
      [
        _c(
          "f7-navbar",
          [
            _c("tommy-nav-back"),
            _vm._v(" "),
            _c("f7-nav-title", [_vm._v(_vm._s(_vm.pageTitle))]),
            _vm._v(" "),
            _c(
              "f7-nav-right",
              [
                _vm.showSave
                  ? _c("f7-link", {
                      attrs: { "icon-f7": "check" },
                      on: { click: _vm.save }
                    })
                  : _vm._e()
              ],
              1
            )
          ],
          1
        ),
        _vm._v(" "),
        _c(
          "f7-list",
          { staticClass: "list-custom" },
          [
            _c(
              "f7-list-item",
              {
                attrs: {
                  title: _vm.$t("invoicing.common.choose_range", "Choose Range")
                }
              },
              [
                _c("f7-toggle", {
                  attrs: { slot: "after", checked: _vm.isCustomRange },
                  on: {
                    change: function($event) {
                      return _vm.toggleCustomRange($event.target.checked)
                    }
                  },
                  slot: "after"
                })
              ],
              1
            ),
            _vm._v(" "),
            _vm.isCustomRange
              ? _c("f7-list-input", {
                  attrs: {
                    label: _vm.$t("invoicing.common.amount_min", "From"),
                    type: "number",
                    value: _vm.amount_min
                  },
                  on: {
                    input: function($event) {
                      return _vm.setMin($event.target.value)
                    }
                  }
                })
              : _vm._e(),
            _vm._v(" "),
            _vm.isCustomRange
              ? _c("f7-list-input", {
                  attrs: {
                    label: _vm.$t("invoicing.common.amount_max", "To"),
                    type: "number",
                    value: _vm.amount_max
                  },
                  on: {
                    input: function($event) {
                      return _vm.setMax($event.target.value)
                    }
                  }
                })
              : _vm._e()
          ],
          1
        )
      ],
      1
    )
  };
  var __vue_staticRenderFns__$b = [];
  __vue_render__$b._withStripped = true;

    /* style */
    var __vue_inject_styles__$b = undefined;
    /* scoped */
    var __vue_scope_id__$b = undefined;
    /* module identifier */
    var __vue_module_identifier__$b = undefined;
    /* functional template */
    var __vue_is_functional_template__$b = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var RangeSelectPage = normalizeComponent_1(
      { render: __vue_render__$b, staticRenderFns: __vue_staticRenderFns__$b },
      __vue_inject_styles__$b,
      __vue_script__$b,
      __vue_scope_id__$b,
      __vue_is_functional_template__$b,
      __vue_module_identifier__$b,
      undefined,
      undefined
    );

  //

  var script$c = {
    props: {
      id: [Number, String],
    },
    data: function data() {
      var self = this;
      return {
        pageTitle: self.id
          ? ((self.$t('invoicing.order_details.title', 'Order')) + " #" + (self.id))
          : self.$t('invoicing.order_details.new_title'),
        order: null,
        showSave: false,
        orderStatuses: orderStatuses,
        products: null,
        packages: null,
        productsOpened: false,
        promotions: null,
        promotionsOpened: false,
        isFeedback: false,
        orderUser: null,
        orderAssignee: null,
        contacts: API.contacts,
      };
    },
    mounted: function mounted() {
      var self = this;
      if (self.id) {
        API.loadOrder(self.id).then(function (order) {
          self.order = order;
          var orderUser = self.$root.teamMembers.filter(
            function (m) { return m.user_id === parseInt(order.user_id, 10); }
          )[0];
          var orderAssignee = self.$root.teamMembers.filter(
            function (m) { return m.user_id === parseInt(order.assignee_id, 10); }
          )[0];
          self.orderAssignee = orderAssignee;
          if (!orderUser) {
            if (self.contacts) {
              // assuming contact
              orderUser = self.contacts.filter(
                function (c) { return c.friend_id === parseInt(order.user_id, 10); }
              )[0];
              self.orderUser = orderUser;
              return;
            }
            self.$api.getContacts.then(function (contacts) {
              self.contacts = contacts;
              orderUser = self.contacts.filter(
                function (c) { return c.friend_id === parseInt(order.user_id, 10); }
              )[0];
              self.orderUser = orderUser;
            });
            return;
          }
          self.orderUser = orderUser;
        });
      } else {
        self.order = {
          comment: '',
          discount: 0,
          total: 0,
          user_id: null,
          vendor_coupon_id: null,
          vendor_order_items: [],
          wallet_transaction_id: null,
          status: 'pending',
          canceled: false,
          data: {
            location: {
              address: '',
              city: '',
            },
            date: new Date().getTime(),
          },
        };
      }

      API.loadProducts().then(function (products) {
        self.products = products;
      });
      API.loadPackages().then(function (packages) {
        self.packages = packages;
      });
      API.loadPromotions().then(function (promotions) {
        self.promotions = promotions;
      });

    },
    beforeDestroy: function beforeDestroy() {
      var self = this;
      if (self.dateCalendar && self.dateCalendar.destroy) {
        self.dateCalendar.destroy();
      }
      if (self.timePicker && self.timePicker.destroy) { self.timePicker.destroy(); }
    },
    computed: {
      orderAssigneeName: function orderAssigneeName() {
        var self = this;
        var user = self.orderAssignee;
        if (!user) { return ''; }
        if (user.friend_team_name) {
          return user.friend_team_name.trim();
        }
        if (user.name) { return user.name.trim(); }
        if (user.first_name) {
          return ("" + (user.first_name) + (user.last_name ? (" " + (user.last_name)) : '')).trim();
        }
        return '';
      },
      orderUserName: function orderUserName() {
        var self = this;
        var user = self.orderUser;
        if (!user) { return ''; }
        if (user.friend_team_name) {
          return user.friend_team_name.trim();
        }
        if (user.name) { return user.name.trim(); }
        if (user.first_name) {
          return ("" + (user.first_name) + (user.last_name ? (" " + (user.last_name)) : '')).trim();
        }
        return '';
      },
      orderItemsTotal: function orderItemsTotal() {
        var self = this;
        var total = 0;
        self.order.vendor_order_items.forEach(function (el) {
          total
            += self.productPrice(el.orderable_id, el.orderable_type) * el.quantity;
        });
        return total;
      },
      orderDiscountTotal: function orderDiscountTotal() {
        var self = this;
        var total = 0;
        if (self.order.vendor_coupon_id) {
          var coupon = self.promotions.filter(
            function (el) { return el.id === self.order.vendor_coupon_id; }
          )[0];
          if (coupon) {
            if (coupon.kind !== 'percentage') {
              total = coupon.amount;
            } else {
              total = self.orderItemsTotal * coupon.amount;
            }
          }
        }
        return total;
      },
      orderTotal: function orderTotal() {
        var self = this;
        return Math.max(self.orderItemsTotal - self.orderDiscountTotal, 0);
      },
      orderCancelable: function orderCancelable() {
        var self = this;
        var order = self.order;
        var canceled = order.canceled;
        return (
          !canceled && (order.status === 'paid' || order.status === 'pending')
        );
      },
    },
    methods: {
      cancelOrder: function cancelOrder() {
        var self = this;
        self.order.canceled = true;
        API.cancelOrder(self.order)
          .then(function (order) {
            self.order = order;
            self.order.canceled = true;
            self.$events.$emit('invoicing:reloadListsOrders');
          })
          .catch(function () {
            self.order.canceled = false;
          });
      },
      calcOrderDuration: function calcOrderDuration() {
        var self = this;
        var duration = 0;
        if (self.order && self.products && self.packages) {
          self.order.vendor_order_items.forEach(function (el) {
            duration
              += self.productDuration(el.orderable_id, el.orderable_type)
              * el.quantity;
          });
        }
        return duration;
      },
      onAssigneeChange: function onAssigneeChange(e) {
        var self = this;
        var user_id = parseInt(e.target.value, 10);
        var assignee = self.$root.teamMembers.filter(
          function (m) { return m.user_id === parseInt(user_id, 10); }
        )[0];
        self.order.assignee_id = assignee.user_id;
        self.order.data.nurse = assignee;
        self.showSave = true;
      },
      onCustomerChange: function onCustomerChange(e) {
        var self = this;
        var user_id = parseInt(e.target.value, 10);
        var orderUser = self.$root.teamMembers.filter(
          function (m) { return m.user_id === parseInt(user_id, 10); }
        )[0];
        if (!orderUser && self.contacts) {
          // assuming contact
          orderUser = self.contacts.filter(
            function (c) { return c.friend_id === parseInt(user_id, 10); }
          )[0];
        }
        self.orderUser = orderUser;
        self.order.user_id = parseInt(e.target.value, 10);
        self.showSave = true;
      },
      onCommentChange: function onCommentChange(e) {
        var self = this;
        self.order.comment = e.target.value;
        self.showSave = true;
      },
      onCityChange: function onCityChange(e) {
        var self = this;
        if (!self.order.data) { self.order.data = {}; }
        if (!self.order.data.location) { self.order.data.location = {}; }
        self.order.data.location.city = e.target.value;
        self.showSave = true;
      },
      onAddressChange: function onAddressChange(e) {
        var self = this;
        if (!self.order.data) { self.order.data = {}; }
        if (!self.order.data.location) { self.order.data.location = {}; }
        self.order.data.location.address = e.target.value;
        self.showSave = true;
      },
      openTimeSelect: function openTimeSelect() {
        var self = this;
        var order = self.order;
        if (self.timePicker) {
          self.timePicker.open();
          return;
        }
        var initialValue = self.formatOrderTime(
          order.data ? parseInt(order.data.date, 10) : null
        );
        var initiallChanged;
        self.timePicker = self.$f7.picker.create({
          value: initialValue ? initialValue.split(':') : [],
          cols: [
            {
              values: '00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23'.split(
                ' '
              ),
            },
            {
              divider: true,
              content: ' : ',
            },
            {
              values: (function () {
                var m = [];
                for (var i = 0; i <= 59; i += 1) {
                  m.push(i < 10 ? ("0" + i) : ("" + i));
                }
                return m;
              })(),
            } ],
          on: {
            change: function change(picker, values) {
              if (!initiallChanged) {
                initiallChanged = true;
                return;
              }
              var currentOrderDate = new Date(
                parseInt(self.order.data.date, 10)
              );
              currentOrderDate.setHours(
                parseInt(values[0], 10),
                parseInt(values[1], 10)
              );
              self.order.data.date = currentOrderDate.getTime();
              self.showSave = true;
            },
          },
        });
        self.timePicker.open();
      },
      openDateSelect: function openDateSelect() {
        var self = this;
        if (self.dateCalendar) {
          self.dateCalendar.open();
          return;
        }
        var initiallChanged;
        self.dateCalendar = self.$f7.calendar.create({
          value: self.order.data.date ? [parseInt(self.order.data.date, 10)] : [],
          on: {
            change: function change(calendar, value) {
              if (!initiallChanged) {
                initiallChanged = true;
                return;
              }

              var currentOrderDate = new Date(
                parseInt(self.order.data.date, 10)
              );
              var newOrderDate = new Date(value[0]);

              currentOrderDate.setFullYear(newOrderDate.getFullYear());
              currentOrderDate.setMonth(newOrderDate.getMonth());
              currentOrderDate.setDate(newOrderDate.getDate());
              self.order.data.date = currentOrderDate.getTime();
              self.showSave = true;
            },
          },
        });
        self.dateCalendar.open();
      },
      promotionName: function promotionName(id) {
        var self = this;
        return self.promotions.filter(function (el) { return el.id === parseInt(id, 10); })[0].name;
      },
      promotionDiscount: function promotionDiscount(id) {
        var self = this;
        var promo = self.promotions.filter(function (el) { return el.id === parseInt(id, 10); })[0];
        if (!promo) { return 0; }
        if (promo.kind !== 'percentage') { return promo.amount; }
        return self.orderItemsTotal * promo.amount;
      },
      productName: function productName(id, type) {
        if ( type === void 0 ) type = 'VendorProduct';

        var self = this;
        var product = self[
          type === 'VendorProduct' ? 'products' : 'packages'
        ].filter(function (el) { return el.id === parseInt(id, 10); })[0];
        return product ? product.name : '';
      },
      productPrice: function productPrice(id, type) {
        if ( type === void 0 ) type = 'VendorProduct';

        var self = this;
        var product = self[
          type === 'VendorProduct' ? 'products' : 'packages'
        ].filter(function (el) { return el.id === parseInt(id, 10); })[0];
        return product ? product.price : 0;
      },
      productDuration: function productDuration(id, type) {
        if ( type === void 0 ) type = 'VendorProduct';

        var self = this;
        var product = self[
          type === 'VendorProduct' ? 'products' : 'packages'
        ].filter(function (el) { return el.id === parseInt(id, 10); })[0];
        return product ? parseInt(product.data.duration, 10) : 0;
      },

      formatOrderDate: function formatOrderDate(date) {
        var self = this;
        if (!date) { return ''; }
        return self.$moment(new Date(parseInt(date, 10))).format('D MMM YYYY');
      },
      formatOrderTime: function formatOrderTime(date) {
        var self = this;
        if (!date) { return ''; }
        return self.$moment(new Date(parseInt(date, 10))).format('HH:mm');
      },
      formatDate: function formatDate(date) {
        var self = this;
        return self.$moment(new Date(date)).format('HH:mm D MMM YYYY');
      },
      onStatusChange: function onStatusChange(e) {
        var self = this;
        var prevStatus = self.order.status;
        self.order.status = e.target.value;
        if (prevStatus !== 'paid' && self.order.status === 'paid') {
          self.orderChangedToPaid = true;
        }
        self.showSave = true;
      },
      onTypeChange: function onTypeChange(e) {
        var self = this;
        if (e.target.value === 'quote') { self.order.quote = true; }
        else { self.order.quote = false; }
        self.showSave = true;
      },
      increaseOrderItem: function increaseOrderItem(index) {
        var self = this;
        self.order.vendor_order_items[index].quantity += 1;
        self.showSave = true;
      },
      decreaseOrderItem: function decreaseOrderItem(index) {
        var self = this;
        self.order.vendor_order_items[index].quantity -= 1;
        if (self.order.vendor_order_items[index].quantity === 0) {
          if (self.order.vendor_order_items[index].id) {
            self.order.vendor_order_items[index]._destroy = true;
          } else {
            self.order.vendor_order_items.splice(index, 1);
          }
        }
        self.showSave = true;
      },
      addOrderItem: function addOrderItem(product, type) {
        var self = this;
        self.productsOpened = false;
        var hasProduct;
        self.order.vendor_order_items.forEach(function (el) {
          if (el.orderable_id === product.id) {
            hasProduct = true;
            if (el._destroy) {
              el._destroy = false;
              delete el._destroy;
              el.quantity = 1;
              self.showSave = true;
            }
          }
        });
        if (hasProduct) { return; }

        self.order.vendor_order_items.push({
          orderable_id: product.id,
          orderable_type: type,
          quantity: 1,
        });
        self.showSave = true;
      },
      addOrderPromotion: function addOrderPromotion(promotion) {
        var self = this;
        self.promotionsOpened = false;
        self.order.vendor_coupon_id = promotion.id;
        self.showSave = true;
      },
      deleteOrderPromotion: function deleteOrderPromotion() {
        var self = this;
        self.order.vendor_coupon_id = null;
        self.showSave = true;
      },
      save: function save() {
        var self = this;
        var data = Object.assign({}, self.order);
        self.showSave = false;
        if (!data.name && data.vendor_order_items.length) {
          data.name = self.productName(
            data.vendor_order_items[0].orderable_id,
            data.vendor_order_items[0].orderable_type
          );
        }
        data.vendor_order_items_attributes = [].concat( data.vendor_order_items );
        data.total = self.orderItemsTotal;
        data.discount = self.orderDiscountTotal;
        delete data.vendor_order_items;

        var needNewEvent =        self.orderChangedToPaid
          && !data.event_id
          && data.data.date
          && data.data.nurse
          && data.data.location
          && data.id
          && data.user_id;
        if (needNewEvent) {
          var orderDate = data.data.date;
          if (typeof orderDate === 'string') { orderDate = parseInt(orderDate, 10); }
          var end_at;
          if (data.data.duration && data.data.duration > 0) {
            end_at = orderDate + parseInt(data.data.duration, 10) * 60 * 1000;
          }
          data.event_attributes = {
            addon: 'nurse_booking',
            title: data.name,
            start_at: new Date(orderDate).toJSON(),
            end_at: new Date(end_at).toJSON(),
            location: ((data.data.location.city) + " " + (data.data.location.address)),
            user_id: data.user_id,
            team_id: null,
            assignee_id: data.data.nurse.user_id,
            assignee_team_id: self.$root.team.id,
            kind: 'Booking',
            resource_id: data.id,
            resource_type: 'VendorOrder',
          };
        }
        API.saveOrder(data).then(function (order) {
          self.order = order;
          self.$events.$emit('invoicing:reloadListsOrders');
        });
      },
    },
  };

  /* script */
  var __vue_script__$c = script$c;

  /* template */
  var __vue_render__$c = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-popup",
      { ref: "popup" },
      [
        _c(
          "f7-view",
          { attrs: { "ios-dynamic-navbar": false } },
          [
            _c(
              "f7-page",
              {
                staticClass: "invoicing-page",
                attrs: {
                  name: "invoicing__order-details",
                  id: "invoicing__order-details"
                }
              },
              [
                _c(
                  "f7-navbar",
                  [
                    _c(
                      "f7-nav-left",
                      [
                        _c("f7-link", {
                          attrs: { "popup-close": "", "icon-f7": "close" }
                        })
                      ],
                      1
                    ),
                    _vm._v(" "),
                    _c("f7-nav-title", [_vm._v(_vm._s(_vm.pageTitle))]),
                    _vm._v(" "),
                    _c(
                      "f7-nav-right",
                      [
                        _vm.showSave
                          ? _c("f7-link", {
                              attrs: { "icon-f7": "check" },
                              on: { click: _vm.save }
                            })
                          : _vm._e()
                      ],
                      1
                    )
                  ],
                  1
                ),
                _vm._v(" "),
                _vm.order
                  ? [
                      _c(
                        "f7-list",
                        { staticClass: "list-custom" },
                        [
                          _vm.order.created_at && _vm.order.id
                            ? _c("f7-list-item", {
                                attrs: {
                                  title: _vm.$t(
                                    "invoicing.order_details.created"
                                  ),
                                  after: _vm.formatDate(_vm.order.created_at)
                                }
                              })
                            : _vm._e(),
                          _vm._v(" "),
                          _c("f7-list-item", {
                            attrs: {
                              title: _vm.$t("invoicing.order_details.due_date"),
                              link: true,
                              after: _vm.formatOrderDate(
                                _vm.order.data
                                  ? parseInt(_vm.order.data.date, 10)
                                  : null
                              )
                            },
                            on: { click: _vm.openDateSelect }
                          }),
                          _vm._v(" "),
                          _c("f7-list-item", {
                            attrs: {
                              title: _vm.$t("invoicing.order_details.due_time"),
                              link: true,
                              after: _vm.formatOrderTime(
                                _vm.order.data
                                  ? parseInt(_vm.order.data.date, 10)
                                  : null
                              )
                            },
                            on: { click: _vm.openTimeSelect }
                          }),
                          _vm._v(" "),
                          _vm.order.data && _vm.order.data.location
                            ? _c("f7-list-input", {
                                attrs: {
                                  label: _vm.$t("invoicing.order_details.city"),
                                  placeholder: _vm.$t(
                                    "invoicing.order_details.city_placeholder"
                                  ),
                                  type: "text",
                                  value: _vm.order.data.location.city
                                },
                                on: { input: _vm.onCityChange }
                              })
                            : _vm._e(),
                          _vm._v(" "),
                          _vm.order.data && _vm.order.data.location
                            ? _c("f7-list-input", {
                                attrs: {
                                  label: _vm.$t(
                                    "invoicing.order_details.address"
                                  ),
                                  placeholder: _vm.$t(
                                    "invoicing.order_details.address_placeholder"
                                  ),
                                  type: "text",
                                  value: _vm.order.data.location.address
                                },
                                on: { input: _vm.onAddressChange }
                              })
                            : _vm._e(),
                          _vm._v(" "),
                          _c(
                            "f7-list-item",
                            {
                              attrs: {
                                title: _vm.$t("invoicing.order_details.status"),
                                "smart-select": "",
                                "smart-select-params": {
                                  openIn: "popover",
                                  closeOnSelect: true,
                                  routableModals: false
                                }
                              }
                            },
                            [
                              _c(
                                "select",
                                { on: { change: _vm.onStatusChange } },
                                _vm._l(_vm.orderStatuses, function(
                                  status,
                                  index
                                ) {
                                  return _c(
                                    "option",
                                    {
                                      key: index,
                                      domProps: {
                                        value: status,
                                        selected: _vm.order.status === status
                                      }
                                    },
                                    [
                                      _vm._v(
                                        _vm._s(
                                          _vm.$t(
                                            "invoicing.order_status." + status
                                          )
                                        )
                                      )
                                    ]
                                  )
                                }),
                                0
                              )
                            ]
                          ),
                          _vm._v(" "),
                          _c(
                            "f7-list-item",
                            {
                              attrs: {
                                title: _vm.$t("invoicing.order_details.type"),
                                "smart-select": "",
                                "smart-select-params": {
                                  openIn: "popover",
                                  closeOnSelect: true,
                                  routableModals: false
                                }
                              }
                            },
                            [
                              _c("select", { on: { change: _vm.onTypeChange } }, [
                                _c(
                                  "option",
                                  {
                                    attrs: { value: "invoice" },
                                    domProps: { selected: !_vm.order.quote }
                                  },
                                  [
                                    _vm._v(
                                      _vm._s(
                                        _vm.$t("invoicing.list_edit.type_invoice")
                                      )
                                    )
                                  ]
                                ),
                                _vm._v(" "),
                                _c(
                                  "option",
                                  {
                                    attrs: { value: "quote" },
                                    domProps: { selected: _vm.order.quote }
                                  },
                                  [
                                    _vm._v(
                                      _vm._s(
                                        _vm.$t("invoicing.list_edit.type_quote")
                                      )
                                    )
                                  ]
                                )
                              ])
                            ]
                          ),
                          _vm._v(" "),
                          _c("f7-list-item", {
                            attrs: {
                              divider: "",
                              title: _vm.$t("invoicing.order_details.comment")
                            }
                          }),
                          _vm._v(" "),
                          _c("f7-list-input", {
                            attrs: {
                              type: "textarea",
                              value: _vm.order.comment,
                              placeholder: _vm.$t(
                                "invoicing.order_details.comment_placeholder"
                              ),
                              resizable: ""
                            },
                            on: { input: _vm.onCommentChange }
                          }),
                          _vm._v(" "),
                          _vm.orderAssignee
                            ? [
                                _c("f7-list-item", {
                                  attrs: {
                                    divider: "",
                                    title: _vm.$t(
                                      "invoicing.order_details.assignee"
                                    )
                                  }
                                }),
                                _vm._v(" "),
                                _c(
                                  "f7-list-item",
                                  {
                                    attrs: {
                                      title: _vm.orderAssignee
                                        ? _vm.orderAssigneeName
                                        : "",
                                      "smart-select": ""
                                    }
                                  },
                                  [
                                    _c("tommy-circle-avatar", {
                                      attrs: {
                                        slot: "media",
                                        data: _vm.orderAssignee
                                      },
                                      slot: "media"
                                    }),
                                    _vm._v(" "),
                                    _c(
                                      "select",
                                      {
                                        attrs: { name: "assignee" },
                                        on: { change: _vm.onAssigneeChange }
                                      },
                                      _vm._l(_vm.$root.teamMembers, function(
                                        teamMember,
                                        index
                                      ) {
                                        return _c(
                                          "option",
                                          {
                                            key:
                                              "teamMember-" +
                                              index +
                                              "-" +
                                              teamMember.id,
                                            attrs: {
                                              "data-option-class":
                                                "invoicing-smart-select-option",
                                              "data-option-image":
                                                teamMember.icon_url
                                            },
                                            domProps: {
                                              value: teamMember.user_id,
                                              selected:
                                                _vm.order.user_id ===
                                                teamMember.user_id
                                            }
                                          },
                                          [
                                            _vm._v(
                                              "\n                  " +
                                                _vm._s(
                                                  teamMember.first_name || ""
                                                ) +
                                                " " +
                                                _vm._s(teamMember.last_name || "")
                                            )
                                          ]
                                        )
                                      }),
                                      0
                                    ),
                                    _vm._v(" "),
                                    _c(
                                      "f7-link",
                                      {
                                        staticStyle: {
                                          "margin-left": "80px",
                                          padding: "8px 0"
                                        },
                                        attrs: {
                                          slot: "root",
                                          href:
                                            "/team-member-details/?user_id=" +
                                            _vm.order.assignee_id +
                                            "&name=" +
                                            _vm.orderAssigneeName
                                        },
                                        slot: "root"
                                      },
                                      [
                                        _c("span", [
                                          _vm._v(
                                            _vm._s(
                                              _vm.$t(
                                                "invoicing.order_details.assignee_profile"
                                              )
                                            )
                                          )
                                        ]),
                                        _vm._v(" "),
                                        _c("f7-icon", {
                                          attrs: { f7: "chevron_right", size: 16 }
                                        })
                                      ],
                                      1
                                    )
                                  ],
                                  1
                                )
                              ]
                            : _vm._e(),
                          _vm._v(" "),
                          [
                            _c("f7-list-item", {
                              attrs: {
                                divider: "",
                                title: _vm.$t("invoicing.order_details.customer")
                              }
                            }),
                            _vm._v(" "),
                            _c(
                              "f7-list-item",
                              {
                                attrs: {
                                  title: _vm.orderUser ? _vm.orderUserName : "",
                                  "smart-select": ""
                                }
                              },
                              [
                                _c("tommy-circle-avatar", {
                                  attrs: { slot: "media", data: _vm.orderUser },
                                  slot: "media"
                                }),
                                _vm._v(" "),
                                _c(
                                  "select",
                                  {
                                    attrs: { name: "customer" },
                                    on: { change: _vm.onCustomerChange }
                                  },
                                  [
                                    _vm._l(_vm.contacts, function(
                                      contact,
                                      index
                                    ) {
                                      return _c(
                                        "option",
                                        {
                                          key:
                                            "contact-" +
                                            index +
                                            "-" +
                                            contact.friend_id,
                                          attrs: {
                                            "data-option-class":
                                              "invoicing-smart-select-option",
                                            "data-option-image": contact.icon_url
                                          },
                                          domProps: {
                                            value: contact.friend_id,
                                            selected:
                                              _vm.order.user_id ===
                                              contact.friend_id
                                          }
                                        },
                                        [
                                          _vm._v(
                                            "\n                  " +
                                              _vm._s(contact.first_name || "") +
                                              " " +
                                              _vm._s(contact.last_name || "")
                                          )
                                        ]
                                      )
                                    }),
                                    _vm._v(" "),
                                    _vm._l(_vm.$root.teamMembers, function(
                                      teamMember,
                                      index
                                    ) {
                                      return _c(
                                        "option",
                                        {
                                          key:
                                            "teamMember-" +
                                            index +
                                            "-" +
                                            teamMember.id,
                                          attrs: {
                                            "data-option-class":
                                              "invoicing-smart-select-option",
                                            "data-option-image":
                                              teamMember.icon_url
                                          },
                                          domProps: {
                                            value: teamMember.user_id,
                                            selected:
                                              _vm.order.user_id ===
                                              teamMember.user_id
                                          }
                                        },
                                        [
                                          _vm._v(
                                            "\n                  " +
                                              _vm._s(
                                                teamMember.first_name || ""
                                              ) +
                                              " " +
                                              _vm._s(teamMember.last_name || "")
                                          )
                                        ]
                                      )
                                    })
                                  ],
                                  2
                                ),
                                _vm._v(" "),
                                _c(
                                  "f7-link",
                                  {
                                    staticStyle: {
                                      "margin-left": "80px",
                                      padding: "8px 0"
                                    },
                                    attrs: {
                                      slot: "root",
                                      href:
                                        "/contact-details/?user_id=" +
                                        _vm.order.assignee_id
                                    },
                                    slot: "root"
                                  },
                                  [
                                    _c("span", [
                                      _vm._v(
                                        _vm._s(
                                          _vm.$t(
                                            "invoicing.order_details.customer_profile"
                                          )
                                        )
                                      )
                                    ]),
                                    _vm._v(" "),
                                    _c("f7-icon", {
                                      attrs: { f7: "chevron_right", size: 16 }
                                    })
                                  ],
                                  1
                                )
                              ],
                              1
                            )
                          ],
                          _vm._v(" "),
                          _c("f7-list-item", {
                            attrs: {
                              divider: "",
                              title: _vm.$t("invoicing.order_details.items")
                            }
                          }),
                          _vm._v(" "),
                          _vm.products && _vm.packages
                            ? _c(
                                "li",
                                { staticClass: "invoicing-order-items" },
                                [
                                  _c(
                                    "div",
                                    {
                                      staticClass: "invoicing-order-add-box",
                                      on: {
                                        click: function($event) {
                                          _vm.productsOpened = true;
                                        }
                                      }
                                    },
                                    [
                                      _c("f7-icon", { attrs: { f7: "add" } }),
                                      _vm._v(" "),
                                      _c(
                                        "div",
                                        {
                                          staticClass:
                                            "invoicing-order-add-box-placeholder"
                                        },
                                        [
                                          _vm._v(
                                            _vm._s(
                                              _vm.$t(
                                                "invoicing.order_details.add_item_label"
                                              )
                                            )
                                          )
                                        ]
                                      )
                                    ],
                                    1
                                  ),
                                  _vm._v(" "),
                                  _vm._l(_vm.order.vendor_order_items, function(
                                    product,
                                    index
                                  ) {
                                    return !product._destroy
                                      ? _c(
                                          "div",
                                          {
                                            key:
                                              product.orderable_id + "-" + index,
                                            staticClass: "invoicing-order-item"
                                          },
                                          [
                                            _c(
                                              "div",
                                              {
                                                staticClass:
                                                  "invoicing-order-item-name"
                                              },
                                              [
                                                _vm._v(
                                                  _vm._s(
                                                    _vm.productName(
                                                      product.orderable_id,
                                                      product.orderable_type
                                                    )
                                                  ) + "\n              "
                                                )
                                              ]
                                            ),
                                            _vm._v(" "),
                                            _c(
                                              "div",
                                              {
                                                staticClass:
                                                  "invoicing-order-item-details"
                                              },
                                              [
                                                _c(
                                                  "div",
                                                  {
                                                    staticClass:
                                                      "invoicing-order-item-price"
                                                  },
                                                  [
                                                    _vm._v(
                                                      _vm._s(
                                                        _vm.productPrice(
                                                          product.orderable_id,
                                                          product.orderable_type
                                                        )
                                                      ) + "\n                "
                                                    )
                                                  ]
                                                ),
                                                _vm._v(" "),
                                                _c(
                                                  "div",
                                                  {
                                                    staticClass:
                                                      "invoicing-order-item-selector"
                                                  },
                                                  [
                                                    _c("f7-link", {
                                                      attrs: {
                                                        "icon-f7": "delete_round"
                                                      },
                                                      on: {
                                                        click: function($event) {
                                                          return _vm.decreaseOrderItem(
                                                            index
                                                          )
                                                        }
                                                      }
                                                    }),
                                                    _vm._v(" "),
                                                    _c(
                                                      "div",
                                                      {
                                                        staticClass:
                                                          "invoicing-order-item-qty"
                                                      },
                                                      [
                                                        _vm._v(
                                                          _vm._s(product.quantity)
                                                        )
                                                      ]
                                                    ),
                                                    _vm._v(" "),
                                                    _c("f7-link", {
                                                      attrs: {
                                                        "icon-f7":
                                                          "add_round_fill"
                                                      },
                                                      on: {
                                                        click: function($event) {
                                                          return _vm.increaseOrderItem(
                                                            index
                                                          )
                                                        }
                                                      }
                                                    })
                                                  ],
                                                  1
                                                )
                                              ]
                                            )
                                          ]
                                        )
                                      : _vm._e()
                                  }),
                                  _vm._v(" "),
                                  _vm.orderItemsTotal
                                    ? _c(
                                        "div",
                                        { staticClass: "invoicing-order-total" },
                                        [
                                          _c(
                                            "div",
                                            {
                                              staticClass:
                                                "invoicing-order-total-row"
                                            },
                                            [
                                              _c(
                                                "div",
                                                {
                                                  staticClass:
                                                    "invoicing-order-total-label"
                                                },
                                                [
                                                  _vm._v(
                                                    _vm._s(
                                                      _vm.$t(
                                                        "invoicing.order_details.total"
                                                      )
                                                    )
                                                  )
                                                ]
                                              ),
                                              _vm._v(" "),
                                              _c(
                                                "div",
                                                {
                                                  staticClass:
                                                    "invoicing-order-total-value"
                                                },
                                                [
                                                  _vm._v(
                                                    _vm._s(_vm.orderItemsTotal)
                                                  )
                                                ]
                                              )
                                            ]
                                          )
                                        ]
                                      )
                                    : _vm._e()
                                ],
                                2
                              )
                            : _vm._e(),
                          _vm._v(" "),
                          _c("f7-list-item", {
                            attrs: {
                              divider: "",
                              title: _vm.$t("invoicing.order_details.promotions")
                            }
                          }),
                          _vm._v(" "),
                          _vm.promotions
                            ? _c("li", { staticClass: "invoicing-order-items" }, [
                                _c(
                                  "div",
                                  {
                                    staticClass: "invoicing-order-add-box",
                                    on: {
                                      click: function($event) {
                                        _vm.promotionsOpened = true;
                                      }
                                    }
                                  },
                                  [
                                    _c("f7-icon", { attrs: { f7: "add" } }),
                                    _vm._v(" "),
                                    _c(
                                      "div",
                                      {
                                        staticClass:
                                          "invoicing-order-add-box-placeholder"
                                      },
                                      [
                                        _vm._v(
                                          _vm._s(
                                            _vm.$t(
                                              "invoicing.order_details.add_promotion_label"
                                            )
                                          ) + "\n              "
                                        )
                                      ]
                                    )
                                  ],
                                  1
                                ),
                                _vm._v(" "),
                                _vm.order.vendor_coupon_id
                                  ? _c(
                                      "div",
                                      { staticClass: "invoicing-order-item" },
                                      [
                                        _c(
                                          "div",
                                          {
                                            staticClass:
                                              "invoicing-order-item-name"
                                          },
                                          [
                                            _vm._v(
                                              _vm._s(
                                                _vm.promotionName(
                                                  _vm.order.vendor_coupon_id
                                                )
                                              )
                                            )
                                          ]
                                        ),
                                        _vm._v(" "),
                                        _c(
                                          "div",
                                          {
                                            staticClass:
                                              "invoicing-order-item-details"
                                          },
                                          [
                                            _c(
                                              "div",
                                              {
                                                staticClass:
                                                  "invoicing-order-item-price"
                                              },
                                              [
                                                _vm._v(
                                                  "-" +
                                                    _vm._s(
                                                      _vm.promotionDiscount(
                                                        _vm.order.vendor_coupon_id
                                                      )
                                                    )
                                                )
                                              ]
                                            ),
                                            _vm._v(" "),
                                            _c(
                                              "div",
                                              {
                                                staticClass:
                                                  "invoicing-order-item-selector"
                                              },
                                              [
                                                _c("f7-link", {
                                                  attrs: {
                                                    "icon-f7": "delete_round"
                                                  },
                                                  on: {
                                                    click: function($event) {
                                                      return _vm.deleteOrderPromotion()
                                                    }
                                                  }
                                                })
                                              ],
                                              1
                                            )
                                          ]
                                        )
                                      ]
                                    )
                                  : _vm._e(),
                                _vm._v(" "),
                                _vm.orderDiscountTotal
                                  ? _c(
                                      "div",
                                      { staticClass: "invoicing-order-total" },
                                      [
                                        _c(
                                          "div",
                                          {
                                            staticClass:
                                              "invoicing-order-total-row"
                                          },
                                          [
                                            _c(
                                              "div",
                                              {
                                                staticClass:
                                                  "invoicing-order-total-label"
                                              },
                                              [
                                                _vm._v(
                                                  _vm._s(
                                                    _vm.$t(
                                                      "invoicing.order_details.total"
                                                    )
                                                  )
                                                )
                                              ]
                                            ),
                                            _vm._v(" "),
                                            _c(
                                              "div",
                                              {
                                                staticClass:
                                                  "invoicing-order-total-value"
                                              },
                                              [
                                                _vm._v(
                                                  "-" +
                                                    _vm._s(_vm.orderDiscountTotal)
                                                )
                                              ]
                                            )
                                          ]
                                        )
                                      ]
                                    )
                                  : _vm._e()
                              ])
                            : _vm._e(),
                          _vm._v(" "),
                          _c("f7-list-item", {
                            attrs: {
                              divider: "",
                              title: _vm.$t("invoicing.order_details.payment")
                            }
                          }),
                          _vm._v(" "),
                          _vm.products && _vm.packages && _vm.promotions
                            ? _c("li", { staticClass: "invoicing-order-items" }, [
                                _c(
                                  "div",
                                  { staticClass: "invoicing-order-total" },
                                  [
                                    _vm.orderItemsTotal
                                      ? _c(
                                          "div",
                                          {
                                            staticClass:
                                              "invoicing-order-total-row"
                                          },
                                          [
                                            _c(
                                              "div",
                                              {
                                                staticClass:
                                                  "invoicing-order-total-label"
                                              },
                                              [
                                                _vm._v(
                                                  _vm._s(
                                                    _vm.$t(
                                                      "invoicing.order_details.items"
                                                    )
                                                  )
                                                )
                                              ]
                                            ),
                                            _vm._v(" "),
                                            _c(
                                              "div",
                                              {
                                                staticClass:
                                                  "invoicing-order-total-value"
                                              },
                                              [
                                                _vm._v(
                                                  _vm._s(_vm.orderItemsTotal)
                                                )
                                              ]
                                            )
                                          ]
                                        )
                                      : _vm._e(),
                                    _vm._v(" "),
                                    _vm.orderDiscountTotal
                                      ? _c(
                                          "div",
                                          {
                                            staticClass:
                                              "invoicing-order-total-row"
                                          },
                                          [
                                            _c(
                                              "div",
                                              {
                                                staticClass:
                                                  "invoicing-order-total-label"
                                              },
                                              [
                                                _vm._v(
                                                  _vm._s(
                                                    _vm.$t(
                                                      "invoicing.order_details.promotions"
                                                    )
                                                  )
                                                )
                                              ]
                                            ),
                                            _vm._v(" "),
                                            _c(
                                              "div",
                                              {
                                                staticClass:
                                                  "invoicing-order-total-value"
                                              },
                                              [
                                                _vm._v(
                                                  "-" +
                                                    _vm._s(_vm.orderDiscountTotal)
                                                )
                                              ]
                                            )
                                          ]
                                        )
                                      : _vm._e(),
                                    _vm._v(" "),
                                    _vm.order.data.payment_method
                                      ? _c(
                                          "div",
                                          {
                                            staticClass:
                                              "invoicing-order-total-row"
                                          },
                                          [
                                            _c(
                                              "div",
                                              {
                                                staticClass:
                                                  "invoicing-order-total-label"
                                              },
                                              [
                                                _vm._v(
                                                  _vm._s(
                                                    _vm.$t(
                                                      "invoicing.order_details.via_label"
                                                    )
                                                  )
                                                )
                                              ]
                                            ),
                                            _vm._v(" "),
                                            _c(
                                              "div",
                                              {
                                                staticClass:
                                                  "invoicing-order-total-value"
                                              },
                                              [
                                                _vm._v(
                                                  "\n                  " +
                                                    _vm._s(
                                                      _vm.$t(
                                                        "invoicing.order_details.via_" +
                                                          _vm.order.data
                                                            .payment_method
                                                      )
                                                    )
                                                )
                                              ]
                                            )
                                          ]
                                        )
                                      : _vm._e(),
                                    _vm._v(" "),
                                    _c(
                                      "div",
                                      {
                                        staticClass:
                                          "invoicing-order-total-row invoicing-order-final-row"
                                      },
                                      [
                                        _c(
                                          "div",
                                          {
                                            staticClass:
                                              "invoicing-order-total-label"
                                          },
                                          [
                                            _vm._v(
                                              _vm._s(
                                                _vm.$t(
                                                  "invoicing.order_details.total"
                                                )
                                              )
                                            )
                                          ]
                                        ),
                                        _vm._v(" "),
                                        _c(
                                          "div",
                                          {
                                            staticClass:
                                              "invoicing-order-total-value"
                                          },
                                          [_vm._v(_vm._s(_vm.orderTotal))]
                                        )
                                      ]
                                    )
                                  ]
                                )
                              ])
                            : _vm._e(),
                          _vm._v(" "),
                          _vm.order &&
                          _vm.order.data.feedback &&
                          _vm.products &&
                          _vm.packages
                            ? [
                                _c("f7-list-item", {
                                  attrs: {
                                    divider: "",
                                    title: _vm.$t(
                                      "invoicing.order_feedback_results.time_clocking"
                                    )
                                  }
                                }),
                                _vm._v(" "),
                                _c("f7-list-item", {
                                  attrs: {
                                    title: _vm.$t(
                                      "invoicing.order_feedback_results.scheduled"
                                    ),
                                    after: _vm.calcOrderDuration()
                                  }
                                }),
                                _vm._v(" "),
                                _c("f7-list-item", {
                                  attrs: {
                                    title: _vm.$t(
                                      "invoicing.order_feedback_results.start"
                                    ),
                                    after: _vm
                                      .$moment(parseInt(_vm.order.data.date, 10))
                                      .format("H:mm DD MMM YYYY")
                                  }
                                }),
                                _vm._v(" "),
                                _c("f7-list-item", {
                                  attrs: {
                                    title: _vm.$t(
                                      "invoicing.order_feedback_results.finish"
                                    ),
                                    after: _vm
                                      .$moment(
                                        parseInt(_vm.order.data.date, 10) +
                                          _vm.calcOrderDuration() * 60 * 1000
                                      )
                                      .format("H:mm DD MMM YYYY")
                                  }
                                }),
                                _vm._v(" "),
                                _vm.order.data.feedback.start_date &&
                                _vm.order.data.feedback.end_date
                                  ? [
                                      _c("f7-list-item", {
                                        attrs: {
                                          divider: "",
                                          title: _vm.$t(
                                            "invoicing.order_feedback_results.time_change"
                                          )
                                        }
                                      }),
                                      _vm._v(" "),
                                      _c("f7-list-item", {
                                        attrs: {
                                          title: _vm.$t(
                                            "invoicing.order_feedback_results.start"
                                          ),
                                          after: _vm
                                            .$moment(
                                              _vm.order.data.feedback.start_date
                                            )
                                            .format("H:mm DD MMM YYYY")
                                        }
                                      }),
                                      _vm._v(" "),
                                      _c("f7-list-item", {
                                        attrs: {
                                          title: _vm.$t(
                                            "invoicing.order_feedback_results.finish"
                                          ),
                                          after: _vm
                                            .$moment(
                                              _vm.order.data.feedback.end_date
                                            )
                                            .format("H:mm DD MMM YYYY")
                                        }
                                      })
                                    ]
                                  : _vm._e(),
                                _vm._v(" "),
                                _vm.order.data.feedback.actual_start_date &&
                                _vm.order.data.feedback.actual_end_date
                                  ? [
                                      _c("f7-list-item", {
                                        attrs: {
                                          divider: "",
                                          title: _vm.$t(
                                            "invoicing.order_feedback_results.actual_time"
                                          )
                                        }
                                      }),
                                      _vm._v(" "),
                                      _c("f7-list-item", {
                                        attrs: {
                                          title: _vm.$t(
                                            "invoicing.order_feedback_results.start"
                                          ),
                                          after: _vm
                                            .$moment(
                                              _vm.order.data.feedback
                                                .actual_start_date
                                            )
                                            .format("H:mm DD MMM YYYY")
                                        }
                                      }),
                                      _vm._v(" "),
                                      _c("f7-list-item", {
                                        attrs: {
                                          title: _vm.$t(
                                            "invoicing.order_feedback_results.finish"
                                          ),
                                          after: _vm
                                            .$moment(
                                              _vm.order.data.feedback
                                                .actual_end_date
                                            )
                                            .format("H:mm DD MMM YYYY")
                                        }
                                      })
                                    ]
                                  : _vm._e(),
                                _vm._v(" "),
                                _c("f7-list-item", {
                                  attrs: {
                                    divider: "",
                                    title: _vm.$t(
                                      "invoicing.order_feedback_results.feedback"
                                    )
                                  }
                                }),
                                _vm._v(" "),
                                _c("f7-list-item", {
                                  attrs: {
                                    title: _vm.$t(
                                      "invoicing.order_feedback_results.question_1"
                                    ),
                                    after: _vm.$t(
                                      "invoicing.order_feedback_results." +
                                        _vm.order.data.feedback.question1
                                    )
                                  }
                                }),
                                _vm._v(" "),
                                _c("f7-list-item", {
                                  attrs: {
                                    title: _vm.$t(
                                      "invoicing.order_feedback_results.question_2"
                                    ),
                                    after: _vm.$t(
                                      "invoicing.order_feedback_results." +
                                        _vm.order.data.feedback.question2
                                    )
                                  }
                                }),
                                _vm._v(" "),
                                _c("f7-list-item", {
                                  attrs: {
                                    title: _vm.$t(
                                      "invoicing.order_feedback_results.question_3"
                                    ),
                                    after: _vm.$t(
                                      "invoicing.order_feedback_results." +
                                        _vm.order.data.feedback.question3
                                    )
                                  }
                                })
                              ]
                            : _vm._e()
                        ],
                        2
                      ),
                      _vm._v(" "),
                      _vm.orderCancelable
                        ? _c(
                            "f7-list",
                            { staticClass: "margin-top margin-bottom" },
                            [
                              _c(
                                "f7-list-button",
                                {
                                  staticClass: "color-custom",
                                  attrs: { color: "custom" },
                                  on: { click: _vm.cancelOrder }
                                },
                                [
                                  _vm._v(
                                    "\n            " +
                                      _vm._s(
                                        _vm.$t(
                                          "invoicing.order_details.cancel_button",
                                          "Cancel Order"
                                        )
                                      )
                                  )
                                ]
                              )
                            ],
                            1
                          )
                        : _vm._e(),
                      _vm._v(" "),
                      _vm.products && _vm.packages
                        ? _c(
                            "f7-popup",
                            {
                              attrs: { opened: _vm.productsOpened },
                              on: {
                                "popup:closed": function($event) {
                                  _vm.productsOpened = false;
                                }
                              }
                            },
                            [
                              _c(
                                "f7-view",
                                { attrs: { init: false } },
                                [
                                  _c(
                                    "f7-page",
                                    { staticClass: "invoicing-page" },
                                    [
                                      _c(
                                        "f7-navbar",
                                        [
                                          _c(
                                            "f7-nav-right",
                                            [
                                              _c("f7-link", {
                                                attrs: { "icon-f7": "close" },
                                                on: {
                                                  click: function($event) {
                                                    _vm.productsOpened = false;
                                                  }
                                                }
                                              })
                                            ],
                                            1
                                          ),
                                          _vm._v(" "),
                                          _c("f7-nav-title", [
                                            _vm._v(
                                              _vm._s(
                                                _vm.$t(
                                                  "invoicing.order_details.add_item_label"
                                                )
                                              )
                                            )
                                          ])
                                        ],
                                        1
                                      ),
                                      _vm._v(" "),
                                      _c("f7-searchbar", {
                                        attrs: {
                                          "search-container":
                                            ".invoicing-order-details-items",
                                          "disable-button": false
                                        }
                                      }),
                                      _vm._v(" "),
                                      _c(
                                        "f7-list",
                                        {
                                          staticClass:
                                            "list-custom invoicing-order-details-products invoicing-order-details-items"
                                        },
                                        [
                                          _c("f7-list-item", {
                                            attrs: {
                                              divider: "",
                                              title: _vm.$t(
                                                "invoicing.order_details.packages"
                                              )
                                            }
                                          }),
                                          _vm._v(" "),
                                          _vm._l(_vm.packages, function(pkg) {
                                            return _c("f7-list-item", {
                                              key: "package-" + pkg.id,
                                              attrs: {
                                                link: "",
                                                title: pkg.name,
                                                after: "¥" + pkg.price
                                              },
                                              on: {
                                                click: function($event) {
                                                  return _vm.addOrderItem(
                                                    pkg,
                                                    "VendorPackage"
                                                  )
                                                }
                                              }
                                            })
                                          }),
                                          _vm._v(" "),
                                          _c("f7-list-item", {
                                            attrs: {
                                              divider: "",
                                              title: _vm.$t(
                                                "invoicing.order_details.items"
                                              )
                                            }
                                          }),
                                          _vm._v(" "),
                                          _vm._l(_vm.products, function(product) {
                                            return _c("f7-list-item", {
                                              key: "product-" + product.id,
                                              attrs: {
                                                link: "",
                                                title: product.name,
                                                after: "¥" + product.price
                                              },
                                              on: {
                                                click: function($event) {
                                                  return _vm.addOrderItem(
                                                    product,
                                                    "VendorProduct"
                                                  )
                                                }
                                              }
                                            })
                                          })
                                        ],
                                        2
                                      )
                                    ],
                                    1
                                  )
                                ],
                                1
                              )
                            ],
                            1
                          )
                        : _vm._e(),
                      _vm._v(" "),
                      _vm.promotions
                        ? _c(
                            "f7-popup",
                            {
                              attrs: { opened: _vm.promotionsOpened },
                              on: {
                                "popup:closed": function($event) {
                                  _vm.promotionsOpened = false;
                                }
                              }
                            },
                            [
                              _c(
                                "f7-view",
                                { attrs: { init: false } },
                                [
                                  _c(
                                    "f7-page",
                                    [
                                      _c(
                                        "f7-navbar",
                                        [
                                          _c(
                                            "f7-nav-right",
                                            [
                                              _c("f7-link", {
                                                attrs: { "icon-f7": "close" },
                                                on: {
                                                  click: function($event) {
                                                    _vm.promotionsOpened = false;
                                                  }
                                                }
                                              })
                                            ],
                                            1
                                          ),
                                          _vm._v(" "),
                                          _c("f7-nav-title", [
                                            _vm._v(
                                              _vm._s(
                                                _vm.$t(
                                                  "invoicing.order_details.add_promotion_label"
                                                )
                                              )
                                            )
                                          ])
                                        ],
                                        1
                                      ),
                                      _vm._v(" "),
                                      _c("f7-searchbar", {
                                        attrs: {
                                          "search-container":
                                            ".invoicing-order-details-promotions",
                                          "disable-button": false
                                        }
                                      }),
                                      _vm._v(" "),
                                      _c(
                                        "f7-list",
                                        {
                                          staticClass:
                                            "list-custom invoicing-order-details-products invoicing-order-details-promotions"
                                        },
                                        _vm._l(_vm.promotions, function(
                                          promotion
                                        ) {
                                          return _c("f7-list-item", {
                                            key: promotion.id,
                                            attrs: {
                                              link: "",
                                              title: promotion.name,
                                              after:
                                                "- ¥" +
                                                (promotion.kind !== "percentage"
                                                  ? promotion.amount
                                                  : promotion.amount *
                                                    _vm.order.total)
                                            },
                                            on: {
                                              click: function($event) {
                                                return _vm.addOrderPromotion(
                                                  promotion
                                                )
                                              }
                                            }
                                          })
                                        }),
                                        1
                                      )
                                    ],
                                    1
                                  )
                                ],
                                1
                              )
                            ],
                            1
                          )
                        : _vm._e()
                    ]
                  : _vm._e()
              ],
              2
            )
          ],
          1
        )
      ],
      1
    )
  };
  var __vue_staticRenderFns__$c = [];
  __vue_render__$c._withStripped = true;

    /* style */
    var __vue_inject_styles__$c = undefined;
    /* scoped */
    var __vue_scope_id__$c = undefined;
    /* module identifier */
    var __vue_module_identifier__$c = undefined;
    /* functional template */
    var __vue_is_functional_template__$c = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var OrderDetailsPage = normalizeComponent_1(
      { render: __vue_render__$c, staticRenderFns: __vue_staticRenderFns__$c },
      __vue_inject_styles__$c,
      __vue_script__$c,
      __vue_scope_id__$c,
      __vue_is_functional_template__$c,
      __vue_module_identifier__$c,
      undefined,
      undefined
    );

  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //
  //

  var script$d = {
    props: {
      order: Object,
      orderDuration: Number,
    },
    data: function data() {
      return {
        navTitle: this.t('confirm_title'),
        step: 'step-1',
        q1: null,
        q2: null,
        q3: null,
        saved: false,
        start_date: null,
        end_date: null,
      };
    },
    computed: {
      durationFormatted: function durationFormatted() {
        return Math.floor(this.orderDuration / 60 * 10) / 10;
      },
    },
    mounted: function mounted() {
      var self = this;
      self.$f7.navbar.size(self.$el.querySelector('.navbar'));
    },
    methods: {
      t: function t(s, data) {
        return this.$t(("invoicing.order_feedback." + s), data);
      },
      stepBack: function stepBack() {
        var self = this;
        var step = self.step;
        if (step === 'step-1-2') {
          self.start_date = null;
          self.end_date = null;
          self.step = 'step-1';
        }
        if (step === 'step-2' && self.start_date) {
          self.step = 'step-1-2';
          self.$nextTick(function () {
            self.initTimePickers();
          });
        } else if (step === 'step-2') {
          self.step = 'step-1';
        }
        if (step === 'step-3') {
          self.step = 'step-2';
        }
        if (step === 'question-1') {
          self.step = 'step-3';
        }
        if (step === 'question-2') {
          self.step = 'question-1';
        }
        if (step === 'question-3') {
          self.step = 'question-2';
        }
      },
      setStep: function setStep(step, data) {
        var self = this;
        if (step === 'step-1-2') {
          self.step = step;
          self.$nextTick(function () {
            self.initTimePickers();
          });
        }
        if (step === 'step-2') {
          self.step = step;
        }
        if (step === 'step-3') {
          self.step = step;
        }
        if (step === 'question-1') {
          self.step = step;
        }
        if (step === 'question-2') {
          self.step = step;
          self.q1 = data;
        }
        if (step === 'question-3') {
          self.step = step;
          self.q2 = data;
        }
        if (step === 'step-4') {
          self.step = step;
          self.q3 = data;
          self.saveFeedback();
        }
      },
      initTimePickers: function initTimePickers() {
        var self = this;
        var orderDate = new Date(parseInt(self.order.data.date, 10));
        var minDate = orderDate.getTime() - 10 * 24 * 60 * 60 * 1000;
        var dates = [];
        for (var i = 0; i < 21; i += 1) {
          dates.push(minDate + i * 24 * 60 * 60 * 1000);
        }
        var hours = [];
        for (var i$1 = 0; i$1 < 24; i$1 += 1) {
          hours.push(i$1 < 10 ? ("0" + i$1) : i$1);
        }
        var minutes = [];
        for (var i$2 = 0; i$2 < 60; i$2 += 1) {
          minutes.push(i$2 < 10 ? ("0" + i$2) : i$2);
        }
        var orderHours = orderDate.getHours();
        if (orderHours < 10) { orderHours = "0" + orderHours; }

        var orderMinutes = orderDate.getMinutes();
        if (orderMinutes < 10) { orderMinutes = "0" + orderMinutes; }

        self.$f7.picker.create({
          inputEl: self.$el.querySelector('#start_date'),
          openIn: 'popover',
          value: [orderDate.getTime(), orderHours, orderMinutes],
          cols: [
            {
              values: dates,
              displayValues: dates.map(function (d) { return self.$moment(d).format('ddd, DD MMM'); }),
            },
            { values: hours },
            { divider: true, content: ':' },
            { values: minutes } ],
          formatValue: function formatValue(values, displayValues) {
            return ((displayValues[0]) + " " + (displayValues[1]) + ":" + (displayValues[2]));
          },
          on: {
            change: function change(p, value) {
              var d = new Date(parseInt(value[0], 10));
              d.setHours(parseInt(value[1], 10), parseInt(value[2], 10), 0, 0);
              self.start_date = d;
            },
          },
        });

        var endDate = new Date(orderDate.getTime() + self.orderDuration * 60 * 1000);
        var endHours = endDate.getHours();
        if (endHours < 10) { endHours = "0" + endHours; }

        var endMinutes = endDate.getMinutes();
        if (endMinutes < 10) { endMinutes = "0" + endMinutes; }

        self.$f7.picker.create({
          inputEl: self.$el.querySelector('#end_date'),
          openIn: 'popover',
          value: [orderDate.getTime(), endHours, endMinutes],
          cols: [
            {
              values: dates,
              displayValues: dates.map(function (d) { return self.$moment(d).format('ddd, DD MMM'); }),
            },
            { values: hours },
            { divider: true, content: ':' },
            { values: minutes } ],
          formatValue: function formatValue(values, displayValues) {
            return ((displayValues[0]) + " " + (displayValues[1]) + ":" + (displayValues[2]));
          },
          on: {
            change: function change(p, value) {
              var d = new Date(parseInt(value[0], 10));
              d.setHours(parseInt(value[1], 10), parseInt(value[2], 10), 0, 0);
              self.end_date = d;
            },
          },
        });
      },
      saveFeedback: function saveFeedback() {
        var self = this;
        self.$emit('feedbackComplete', {
          feedback: {
            question1: self.q1,
            question2: self.q2,
            question3: self.q2,
            start_date: self.start_date ? self.start_date.toJSON() : null,
            end_date: self.end_date ? self.end_date.toJSON() : null,
          },
          callback: function callback() {
            self.saved = true;
          },
        });
      },
      closeFeedback: function closeFeedback() {
        var self = this;
        self.$emit('close');
      },
    },
  };

  /* script */
  var __vue_script__$d = script$d;

  /* template */
  var __vue_render__$d = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-page",
      { staticClass: "invoicing-feedback" },
      [
        _c(
          "f7-navbar",
          [
            _vm.saved
              ? _c(
                  "f7-nav-left",
                  [
                    _c("f7-link", {
                      attrs: { "icon-f7": "close" },
                      on: { click: _vm.closeFeedback }
                    })
                  ],
                  1
                )
              : _vm._e(),
            _vm._v(" "),
            !_vm.saved && _vm.step !== "step-1" && _vm.step !== "step-4"
              ? _c(
                  "f7-nav-left",
                  [
                    _c("f7-link", {
                      attrs: { icon: "icon-back" },
                      on: { click: _vm.stepBack }
                    })
                  ],
                  1
                )
              : _vm._e(),
            _vm._v(" "),
            _c("f7-nav-title", [_vm._v(_vm._s(_vm.navTitle))])
          ],
          1
        ),
        _vm._v(" "),
        _vm.step === "step-1"
          ? _c(
              "div",
              {
                staticClass: "invoicing-feedback-buttons",
                attrs: { slot: "fixed" },
                slot: "fixed"
              },
              [
                _c(
                  "a",
                  {
                    staticClass: "invoicing-feedback-button-no",
                    on: {
                      click: function($event) {
                        return _vm.setStep("step-1-2")
                      }
                    }
                  },
                  [_vm._v(_vm._s(_vm.t("button_no")))]
                ),
                _vm._v(" "),
                _c(
                  "a",
                  {
                    staticClass: "invoicing-feedback-button-yes",
                    on: {
                      click: function($event) {
                        return _vm.setStep("step-2")
                      }
                    }
                  },
                  [_vm._v(_vm._s(_vm.t("button_yes")))]
                )
              ]
            )
          : _vm._e(),
        _vm._v(" "),
        _vm.step === "step-1-2"
          ? _c(
              "div",
              {
                staticClass: "invoicing-feedback-buttons",
                attrs: { slot: "fixed" },
                slot: "fixed"
              },
              [
                _c(
                  "a",
                  {
                    staticClass: "invoicing-feedback-button-submit",
                    on: {
                      click: function($event) {
                        return _vm.setStep("step-2")
                      }
                    }
                  },
                  [_vm._v(_vm._s(_vm.t("button_submit")))]
                )
              ]
            )
          : _vm._e(),
        _vm._v(" "),
        _vm.step === "step-2"
          ? _c(
              "div",
              {
                staticClass: "invoicing-feedback-buttons",
                attrs: { slot: "fixed" },
                slot: "fixed"
              },
              [
                _c(
                  "a",
                  {
                    staticClass: "invoicing-feedback-button-submit",
                    on: {
                      click: function($event) {
                        return _vm.setStep("step-3")
                      }
                    }
                  },
                  [_vm._v(_vm._s(_vm.t("button_start")))]
                )
              ]
            )
          : _vm._e(),
        _vm._v(" "),
        _vm.step === "step-3"
          ? _c(
              "div",
              {
                staticClass: "invoicing-feedback-buttons",
                attrs: { slot: "fixed" },
                slot: "fixed"
              },
              [
                _c(
                  "a",
                  {
                    staticClass: "invoicing-feedback-button-submit",
                    on: {
                      click: function($event) {
                        return _vm.setStep("question-1")
                      }
                    }
                  },
                  [_vm._v(_vm._s(_vm.t("button_next")))]
                )
              ]
            )
          : _vm._e(),
        _vm._v(" "),
        _vm.step === "question-1"
          ? _c(
              "div",
              {
                staticClass: "invoicing-feedback-buttons",
                attrs: { slot: "fixed" },
                slot: "fixed"
              },
              [
                _c(
                  "a",
                  {
                    staticClass: "invoicing-feedback-button-no",
                    on: {
                      click: function($event) {
                        return _vm.setStep("question-2", "no")
                      }
                    }
                  },
                  [_vm._v(_vm._s(_vm.t("button_no")))]
                ),
                _vm._v(" "),
                _c(
                  "a",
                  {
                    staticClass: "invoicing-feedback-button-yes",
                    on: {
                      click: function($event) {
                        return _vm.setStep("question-2", "yes")
                      }
                    }
                  },
                  [_vm._v(_vm._s(_vm.t("button_yes")))]
                )
              ]
            )
          : _vm._e(),
        _vm._v(" "),
        _vm.step === "question-2"
          ? _c(
              "div",
              {
                staticClass: "invoicing-feedback-buttons",
                attrs: { slot: "fixed" },
                slot: "fixed"
              },
              [
                _c(
                  "a",
                  {
                    staticClass: "invoicing-feedback-button-no",
                    on: {
                      click: function($event) {
                        return _vm.setStep("question-3", "no")
                      }
                    }
                  },
                  [_vm._v(_vm._s(_vm.t("button_no")))]
                ),
                _vm._v(" "),
                _c(
                  "a",
                  {
                    staticClass: "invoicing-feedback-button-yes",
                    on: {
                      click: function($event) {
                        return _vm.setStep("question-3", "yes")
                      }
                    }
                  },
                  [_vm._v(_vm._s(_vm.t("button_yes")))]
                )
              ]
            )
          : _vm._e(),
        _vm._v(" "),
        _vm.step === "question-3"
          ? _c(
              "div",
              {
                staticClass: "invoicing-feedback-buttons",
                attrs: { slot: "fixed" },
                slot: "fixed"
              },
              [
                _c(
                  "a",
                  {
                    staticClass: "invoicing-feedback-button-no",
                    on: {
                      click: function($event) {
                        return _vm.setStep("step-4", "no")
                      }
                    }
                  },
                  [_vm._v(_vm._s(_vm.t("button_no")))]
                ),
                _vm._v(" "),
                _c(
                  "a",
                  {
                    staticClass: "invoicing-feedback-button-yes",
                    on: {
                      click: function($event) {
                        return _vm.setStep("step-4", "yes")
                      }
                    }
                  },
                  [_vm._v(_vm._s(_vm.t("button_yes")))]
                )
              ]
            )
          : _vm._e(),
        _vm._v(" "),
        _vm.step === "step-1"
          ? [
              _c("div", { staticClass: "invoicing-feedback-confirm-title" }, [
                _vm._v(_vm._s(_vm.t("time_confirm_title")))
              ]),
              _vm._v(" "),
              _vm.orderDuration
                ? _c("div", { staticClass: "invoicing-feedback-confirm-time" }, [
                    _vm._v(
                      _vm._s(_vm.durationFormatted) + " " + _vm._s(_vm.t("hours"))
                    )
                  ])
                : _vm._e()
            ]
          : _vm._e(),
        _vm._v(" "),
        _vm.step === "step-1-2"
          ? [
              _c("div", { staticClass: "invoicing-feedback-confirm-title" }, [
                _vm._v(_vm._s(_vm.t("time_select_title")))
              ]),
              _vm._v(" "),
              _c("div", {
                staticClass: "invoicing-feedback-confirm-text",
                domProps: { innerHTML: _vm._s(_vm.t("time_select_text")) }
              }),
              _vm._v(" "),
              _c(
                "f7-list",
                [
                  _c("f7-list-input", {
                    attrs: {
                      label: _vm.t("time_select_start"),
                      "inline-label": "",
                      type: "text",
                      inputId: "start_date"
                    }
                  }),
                  _vm._v(" "),
                  _c("f7-list-input", {
                    attrs: {
                      label: _vm.t("time_select_end"),
                      "inline-label": "",
                      type: "text",
                      inputId: "end_date"
                    }
                  })
                ],
                1
              )
            ]
          : _vm._e(),
        _vm._v(" "),
        _vm.step === "step-2"
          ? [
              _c("div", {
                staticClass: "invoicing-feedback-question-text",
                domProps: { innerHTML: _vm._s(_vm.t("feedback_start_text")) }
              })
            ]
          : _vm._e(),
        _vm._v(" "),
        _vm.step === "step-3"
          ? [
              _c("div", {
                staticClass: "invoicing-feedback-question-text",
                domProps: { innerHTML: _vm._s(_vm.t("feedback_info_text")) }
              })
            ]
          : _vm._e(),
        _vm._v(" "),
        _vm.step === "question-1"
          ? [
              _c("div", {
                staticClass: "invoicing-feedback-question-text",
                domProps: { innerHTML: _vm._s(_vm.t("feedback_question_1")) }
              })
            ]
          : _vm._e(),
        _vm._v(" "),
        _vm.step === "question-2"
          ? [
              _c("div", {
                staticClass: "invoicing-feedback-question-text",
                domProps: { innerHTML: _vm._s(_vm.t("feedback_question_2")) }
              })
            ]
          : _vm._e(),
        _vm._v(" "),
        _vm.step === "question-3"
          ? [
              _c("div", {
                staticClass: "invoicing-feedback-question-text",
                domProps: { innerHTML: _vm._s(_vm.t("feedback_question_3")) }
              })
            ]
          : _vm._e(),
        _vm._v(" "),
        _vm.step === "step-4"
          ? [
              _c("div", { staticClass: "invoicing-feedback-end-image" }, [
                _c("img", {
                  attrs: { src: _vm.$addonAssetsUrl + "/feedback-image.svg" }
                })
              ]),
              _vm._v(" "),
              _c("div", { staticClass: "invoicing-feedback-end-title" }, [
                _vm._v(_vm._s(_vm.t("feedback_end_title")))
              ]),
              _vm._v(" "),
              _c("div", {
                staticClass: "invoicing-feedback-end-text",
                domProps: { innerHTML: _vm._s(_vm.t("feedback_end_text")) }
              })
            ]
          : _vm._e()
      ],
      2
    )
  };
  var __vue_staticRenderFns__$d = [];
  __vue_render__$d._withStripped = true;

    /* style */
    var __vue_inject_styles__$d = undefined;
    /* scoped */
    var __vue_scope_id__$d = undefined;
    /* module identifier */
    var __vue_module_identifier__$d = undefined;
    /* functional template */
    var __vue_is_functional_template__$d = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var OrderFeedback = normalizeComponent_1(
      { render: __vue_render__$d, staticRenderFns: __vue_staticRenderFns__$d },
      __vue_inject_styles__$d,
      __vue_script__$d,
      __vue_scope_id__$d,
      __vue_is_functional_template__$d,
      __vue_module_identifier__$d,
      undefined,
      undefined
    );

  //

  var script$e = {
    components: {
      OrderFeedback: OrderFeedback,
    },
    props: {
      id: [Number, String],
    },
    data: function data() {
      var self = this;
      return {
        pageTitle: self.id ? ((self.$t('invoicing.order_details.title', 'Order')) + " #" + (self.id)) : self.$t('invoicing.order_details.new_title'),
        order: null,
        showSave: false,
        orderStatuses: orderStatuses,
        products: null,
        packages: null,
        isFeedback: false,
        orderDuration: 0,
        orderUser: null,
      };
    },
    mounted: function mounted() {
      var self = this;
      Promise.all([
        API.loadOrder(self.id).then(function (order) {
          self.order = order;
          var orderUser = self.$root.teamMembers.filter(function (m) { return m.user_id === parseInt(order.user_id, 10); })[0];
          if (!orderUser) {
            // assuming contact
            self.$api.getContact(order.user_id).then(function (contact) {
              self.orderUser = contact;
            });
          } else {
            self.orderUser = orderUser;
          }
        }),
        API.loadProducts().then(function (products) {
          self.products = products;
        }),
        API.loadPackages().then(function (packages) {
          self.packages = packages;
        }) ]).then(function () {
        self.orderDuration = self.calcOrderDuration();
      });
    },
    computed: {
      orderUserName: function orderUserName() {
        var self = this;
        var user = self.orderUser;
        if (!user) { return ''; }
        if (user.friend_team_name) {
          return user.friend_team_name.trim();
        }
        if (user.name) { return user.name.trim(); }
        if (user.first_name) { return ("" + (user.first_name) + (user.last_name ? (" " + (user.last_name)) : '')).trim(); }
        return '';
      },
      showStartButton: function showStartButton() {
        var self = this;
        if (self.order.status !== 'paid') { return false; }
        var orderDate = new Date(parseInt(self.order.data.date, 10)).getTime();
        var now = new Date().getTime();
        var diffMinutes = (orderDate - now) / 1000 / 60;
        if (Math.abs(diffMinutes) <= 60) { return true; }
        return false;
      },
      showFinishButton: function showFinishButton() {
        var self = this;
        return self.order.status === 'processing';
      },
      orderItemsTotal: function orderItemsTotal() {
        var self = this;
        var total = 0;
        self.order.vendor_order_items.forEach(function (el) {
          total += self.productPrice(el.orderable_id, el.orderable_type) * el.quantity;
        });
        return total;
      },
    },
    methods: {
      calcOrderDuration: function calcOrderDuration() {
        var self = this;
        var duration = 0;
        if (self.order && self.products && self.packages) {
          self.order.vendor_order_items.forEach(function (el) {
            duration += self.productDuration(el.orderable_id, el.orderable_type) * el.quantity;
          });
        }
        return duration;
      },
      productName: function productName(id, type) {
        if ( type === void 0 ) type = 'VendorProduct';

        var self = this;
        var product = self[type === 'VendorProduct' ? 'products' : 'packages'].filter(function (el) { return el.id === parseInt(id, 10); })[0];
        return product ? product.name : '';
      },
      productPrice: function productPrice(id, type) {
        if ( type === void 0 ) type = 'VendorProduct';

        var self = this;
        var product = self[type === 'VendorProduct' ? 'products' : 'packages'].filter(function (el) { return el.id === parseInt(id, 10); })[0];
        return product ? product.price : 0;
      },
      productDuration: function productDuration(id, type) {
        if ( type === void 0 ) type = 'VendorProduct';

        var self = this;
        var product = self[type === 'VendorProduct' ? 'products' : 'packages'].filter(function (el) { return el.id === parseInt(id, 10); })[0];
        return product ? parseInt(product.data.duration, 10) : 0;
      },
      formatOrderDate: function formatOrderDate(date) {
        var self = this;
        if (!date) { return ''; }
        return self.$moment(new Date(parseInt(date, 10))).format('D MMM YYYY');
      },
      formatOrderTime: function formatOrderTime(date) {
        var self = this;
        if (!date) { return ''; }
        return self.$moment(new Date(parseInt(date, 10))).format('HH:mm');
      },
      formatDate: function formatDate(date) {
        var self = this;
        return self.$moment(new Date(date)).format('HH:mm D MMM YYYY');
      },
      startOrder: function startOrder() {
        var self = this;
        var data = Object.assign({}, self.order);
        data.status = 'processing';
        if (!data.data.feedback) { data.data.feedback = {}; }
        data.data.feedback.actual_start_date = new Date().toJSON();
        API.saveOrder(data).then(function (order) {
          self.order = order;
          self.$events.$emit('invoicing:reloadListsOrders');
        });
      },
      finishOrder: function finishOrder() {
        var self = this;
        self.$refs.popup.f7Popup.params.closeByBackdropClick = false;
        self.isFeedback = true;
      },
      onFeedbackComplete: function onFeedbackComplete(obj) {
        var self = this;
        var feedback = obj.feedback;
        var data = Object.assign({}, self.order);
        data.status = 'qa';
        if (!data.data.feedback) { data.data.feedback = feedback; }
        else { Object.assign(data.data.feedback, feedback); }
        data.data.feedback.actual_end_date = new Date().toJSON();
        delete data.vendor_order_items;
        API.saveOrder(data).then(function (order) {
          self.order = order;
          self.$events.$emit('invoicing:reloadListsOrders');
          if (obj.callback) { obj.callback(); }
        });
      },
      onFeedbackClose: function onFeedbackClose() {
        var self = this;
        self.isFeedback = false;
        self.$refs.popup.f7Popup.close();
      },
    },
  };

  /* script */
  var __vue_script__$e = script$e;

  /* template */
  var __vue_render__$e = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-popup",
      { ref: "popup" },
      [
        _c(
          "f7-view",
          { attrs: { "ios-dynamic-navbar": false } },
          [
            _vm.isFeedback
              ? _c("order-feedback", {
                  attrs: { order: _vm.order, orderDuration: _vm.orderDuration },
                  on: {
                    feedbackComplete: _vm.onFeedbackComplete,
                    close: _vm.onFeedbackClose
                  }
                })
              : _vm._e(),
            _vm._v(" "),
            !_vm.isFeedback
              ? _c(
                  "f7-page",
                  {
                    staticClass: "invoicing-page",
                    attrs: {
                      name: "invoicing__order-details",
                      id: "invoicing__order-details"
                    }
                  },
                  [
                    _c(
                      "f7-navbar",
                      [
                        _c(
                          "f7-nav-left",
                          [
                            _c("f7-link", {
                              attrs: { "popup-close": "", "icon-f7": "close" }
                            })
                          ],
                          1
                        ),
                        _vm._v(" "),
                        _c("f7-nav-title", [_vm._v(_vm._s(_vm.pageTitle))]),
                        _vm._v(" "),
                        _c(
                          "f7-nav-right",
                          [
                            _vm.showSave
                              ? _c("f7-link", {
                                  attrs: { "icon-f7": "check" },
                                  on: { click: _vm.save }
                                })
                              : _vm._e()
                          ],
                          1
                        )
                      ],
                      1
                    ),
                    _vm._v(" "),
                    _vm.order && _vm.showStartButton
                      ? _c(
                          "div",
                          {
                            staticClass: "invoicing-toolbar-button",
                            attrs: { slot: "fixed" },
                            on: { click: _vm.startOrder },
                            slot: "fixed"
                          },
                          [
                            _vm._v(
                              _vm._s(
                                _vm.$t("invoicing.order_details.start_button")
                              )
                            )
                          ]
                        )
                      : _vm._e(),
                    _vm._v(" "),
                    _vm.order && _vm.showFinishButton
                      ? _c(
                          "div",
                          {
                            staticClass: "invoicing-toolbar-button",
                            attrs: { slot: "fixed" },
                            on: { click: _vm.finishOrder },
                            slot: "fixed"
                          },
                          [
                            _vm._v(
                              _vm._s(
                                _vm.$t("invoicing.order_details.finish_button")
                              )
                            )
                          ]
                        )
                      : _vm._e(),
                    _vm._v(" "),
                    _vm.order
                      ? [
                          _c(
                            "f7-list",
                            { staticClass: "list-custom" },
                            [
                              _c("f7-list-item", {
                                attrs: {
                                  title: _vm.$t(
                                    "invoicing.order_details.due_date"
                                  ),
                                  link: false,
                                  after: _vm.formatOrderDate(
                                    _vm.order.data
                                      ? parseInt(_vm.order.data.date, 10)
                                      : null
                                  )
                                }
                              }),
                              _vm._v(" "),
                              _c("f7-list-item", {
                                attrs: {
                                  title: _vm.$t(
                                    "invoicing.order_details.due_time"
                                  ),
                                  link: false,
                                  after: _vm.formatOrderTime(
                                    _vm.order.data
                                      ? parseInt(_vm.order.data.date, 10)
                                      : null
                                  )
                                }
                              }),
                              _vm._v(" "),
                              _vm.order.data && _vm.order.data.location
                                ? _c("f7-list-item", {
                                    attrs: {
                                      title: _vm.$t(
                                        "invoicing.order_details.city"
                                      ),
                                      type: "text",
                                      after: _vm.order.data.location.city
                                    }
                                  })
                                : _vm._e(),
                              _vm._v(" "),
                              _vm.order.data && _vm.order.data.location
                                ? _c("f7-list-item", {
                                    attrs: {
                                      title: _vm.$t(
                                        "invoicing.order_details.address"
                                      ),
                                      type: "text",
                                      after: _vm.order.data.location.address
                                    }
                                  })
                                : _vm._e(),
                              _vm._v(" "),
                              _vm.order.comment
                                ? _c("f7-list-item", {
                                    attrs: {
                                      divider: "",
                                      title: _vm.$t(
                                        "invoicing.order_details.comment"
                                      )
                                    }
                                  })
                                : _vm._e(),
                              _vm._v(" "),
                              _vm.order.comment
                                ? _c("f7-list-input", {
                                    attrs: {
                                      type: "textarea",
                                      value: _vm.order.comment,
                                      placeholder: _vm.$t(
                                        "invoicing.order_details.comment_placeholder"
                                      ),
                                      resizable: "",
                                      readonly: true
                                    }
                                  })
                                : _vm._e(),
                              _vm._v(" "),
                              _vm.orderUser
                                ? [
                                    _c("f7-list-item", {
                                      attrs: {
                                        divider: "",
                                        title: _vm.$t(
                                          "invoicing.order_details.customer"
                                        )
                                      }
                                    }),
                                    _vm._v(" "),
                                    _c(
                                      "f7-list-item",
                                      {
                                        attrs: {
                                          title: _vm.orderUserName,
                                          link:
                                            "/contact-details/?user_id=" +
                                            _vm.order.user_id +
                                            "&masterDetailRoot=true",
                                          view: ".view-main",
                                          "reload-all": true
                                        }
                                      },
                                      [
                                        _c("tommy-circle-avatar", {
                                          attrs: {
                                            slot: "media",
                                            data: _vm.orderUser
                                          },
                                          slot: "media"
                                        })
                                      ],
                                      1
                                    )
                                  ]
                                : _vm._e(),
                              _vm._v(" "),
                              _c("f7-list-item", {
                                attrs: {
                                  divider: "",
                                  title: _vm.$t("invoicing.order_details.items")
                                }
                              }),
                              _vm._v(" "),
                              _vm.products && _vm.packages
                                ? _c(
                                    "li",
                                    { staticClass: "invoicing-order-items" },
                                    _vm._l(_vm.order.vendor_order_items, function(
                                      product,
                                      index
                                    ) {
                                      return !product._destroy
                                        ? _c(
                                            "div",
                                            {
                                              key:
                                                product.orderable_id +
                                                "-" +
                                                index,
                                              staticClass: "invoicing-order-item"
                                            },
                                            [
                                              _c(
                                                "div",
                                                {
                                                  staticClass:
                                                    "invoicing-order-item-name"
                                                },
                                                [
                                                  _vm._v(
                                                    _vm._s(
                                                      _vm.productName(
                                                        product.orderable_id,
                                                        product.orderable_type
                                                      )
                                                    )
                                                  )
                                                ]
                                              )
                                            ]
                                          )
                                        : _vm._e()
                                    }),
                                    0
                                  )
                                : _vm._e()
                            ],
                            2
                          )
                        ]
                      : _vm._e()
                  ],
                  2
                )
              : _vm._e()
          ],
          1
        )
      ],
      1
    )
  };
  var __vue_staticRenderFns__$e = [];
  __vue_render__$e._withStripped = true;

    /* style */
    var __vue_inject_styles__$e = undefined;
    /* scoped */
    var __vue_scope_id__$e = undefined;
    /* module identifier */
    var __vue_module_identifier__$e = undefined;
    /* functional template */
    var __vue_is_functional_template__$e = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var OrderDetailsNursePage = normalizeComponent_1(
      { render: __vue_render__$e, staticRenderFns: __vue_staticRenderFns__$e },
      __vue_inject_styles__$e,
      __vue_script__$e,
      __vue_scope_id__$e,
      __vue_is_functional_template__$e,
      __vue_module_identifier__$e,
      undefined,
      undefined
    );

  //

  var script$f = {
    data: function data() {
      return {
        items: null,
        packages: null,
        activeTab: 'items',
      };
    },
    mounted: function mounted() {
      var self = this;
      self.loadPromotions();
      self.$events.$on('invoicing:reloadPromotions', self.loadPromotions);
    },
    beforeDestroy: function beforeDestroy() {
      var self = this;
      self.$events.$off('invoicing:reloadPromotions', self.loadPromotions);
    },
    computed: {
      orderedPromotions: function orderedPromotions() {
        var self = this;
        if (!self.items) { return []; }
        return self.items.sort(function (a, b) { return a.id - b.id; });
      },
    },
    methods: {
      loadPromotions: function loadPromotions() {
        var self = this;
        API.loadPromotions({}, { cache: false }).then(function (items) {
          self.items = items;
        });
      },
    },
  };

  /* script */
  var __vue_script__$f = script$f;

  /* template */
  var __vue_render__$f = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-page",
      {
        staticClass: "invoicing-page",
        attrs: {
          name: "invoicing__promotion-management",
          id: "invoicing__promotion-management"
        }
      },
      [
        _c(
          "f7-navbar",
          [
            _c("tommy-nav-back"),
            _vm._v(" "),
            _c("f7-nav-title", [
              _vm._v(
                _vm._s(
                  _vm.$t("invoicing.promotion_management.title", "Promotions")
                )
              )
            ]),
            _vm._v(" "),
            _c(
              "f7-nav-right",
              [
                _c("f7-link", {
                  attrs: {
                    href: "/invoicing/promotion-details/",
                    "icon-f7": "add"
                  }
                })
              ],
              1
            )
          ],
          1
        ),
        _vm._v(" "),
        _vm.items && _vm.items.length
          ? _c("f7-searchbar", {
              attrs: {
                slot: "static",
                "search-container": ".invoicing-list-items",
                backdrop: false,
                "disable-button": false,
                placeholder: _vm.$t(
                  "invoicing.promotion_management.search_placeholder"
                )
              },
              slot: "static"
            })
          : _vm._e(),
        _vm._v(" "),
        _vm.items && _vm.items.length
          ? _c(
              "f7-list",
              {
                staticClass: "list-custom invoicing-list-items",
                attrs: { slot: "static", "no-hairlines": "" },
                slot: "static"
              },
              _vm._l(_vm.orderedPromotions, function(item) {
                return _c("f7-list-item", {
                  key: item.id,
                  attrs: {
                    title: item.name,
                    link:
                      "/invoicing/promotion-details/" +
                      item.id +
                      "/?title=" +
                      encodeURIComponent(item.name || "")
                  }
                })
              }),
              1
            )
          : _vm._e()
      ],
      1
    )
  };
  var __vue_staticRenderFns__$f = [];
  __vue_render__$f._withStripped = true;

    /* style */
    var __vue_inject_styles__$f = undefined;
    /* scoped */
    var __vue_scope_id__$f = undefined;
    /* module identifier */
    var __vue_module_identifier__$f = undefined;
    /* functional template */
    var __vue_is_functional_template__$f = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var PromotionManagementPage = normalizeComponent_1(
      { render: __vue_render__$f, staticRenderFns: __vue_staticRenderFns__$f },
      __vue_inject_styles__$f,
      __vue_script__$f,
      __vue_scope_id__$f,
      __vue_is_functional_template__$f,
      __vue_module_identifier__$f,
      undefined,
      undefined
    );

  //

  var script$g = {
    components: {
      tagSelect: tagSelect,
    },
    props: {
      id: [String, Number],
    },
    data: function data() {
      var self = this;
      return {
        pageTitle: self.$f7route.query.title || self.$t('invoicing.promotion.new_title'),
        item: null,
        showSave: false,
        customerPopupOpened: false,
        itemsPopupOpened: false,
        products: null,
        packages: null,
        contacts: API.contacts,
      };
    },
    mounted: function mounted() {
      var self = this;
      if (!self.id) {
        self.item = {
          // expire_at: '',
          description: '',
          name: '',
          amount: 0,
          user_id: null,
          vendor_product_id: null,

          vendor_package_id: null,
          category: null,
          kind: 'fixed',
          valid_from: null,
          valid_to: null,
          max_uses: null,
        };
      } else {
        API.loadPromotion(self.id).then(function (item) {
          self.item = item;
        });
      }
      if (!self.contacts) {
        self.$api.getContacts.then(function (contacts) {
          self.contacts = contacts;
          API.contacts = contacts;
        });
        return;
      }

      Promise.all([
        API.loadProducts(),
        API.loadPackages() ]).then(function (ref) {
        var products = ref[0];
        var packages = ref[1];

        self.products = products;
        self.packages = packages;
      });

    },
    computed: {
      customerAvatar: function customerAvatar() {
        var self = this;
        if (!self.item.user_id) { return null; }
        var user;
        if (self.$root.teamMembers) {
          user = self.$root.teamMembers.filter(function (m) { return m.user_id === self.item.user_id; })[0];
        }
        if (!user && self.contacts) {
          // assuming contact
          user = self.contacts.filter(function (c) { return c.friend_id === self.item.user_id; })[0];
        }
        if (!user) { return null; }
        return user;
      },
      customerTitle: function customerTitle() {
        var self = this;
        if (!self.item.user_id) { return self.$t('invoicing.promotion.customer_placeholder'); }
        var user;
        if (self.$root.teamMembers) {
          user = self.$root.teamMembers.filter(function (m) { return m.user_id === self.item.user_id; })[0];
        }
        if (!user && self.contacts) {
          // assuming contact
          user = self.contacts.filter(function (c) { return c.friend_id === self.item.user_id; })[0];
        }
        if (!user) { return ''; }
        return ((user.first_name || '') + " " + (user.last_name || ''));
      },
      itemAvatar: function itemAvatar() {
        var self = this;
        if (!self.item.vendor_product_id && !self.item.vendor_package_id) { return null; }
        var product;
        if (self.item.vendor_product_id) {
          product = self.products.filter(function (p) { return p.id === self.item.vendor_product_id; })[0];
        }
        if (self.item.vendor_package_id) {
          product = self.packages.filter(function (p) { return p.id === self.item.vendor_package_id; })[0];
        }
        if (!product) { return null; }
        return product.image_url;
      },
      itemTitle: function itemTitle() {
        var self = this;
        if (!self.item.vendor_product_id && !self.item.vendor_package_id) { return self.$t('invoicing.promotion.item_placeholder'); }
        var product;
        if (self.item.vendor_product_id) {
          product = self.products.filter(function (p) { return p.id === self.item.vendor_product_id; })[0];
        }
        if (self.item.vendor_package_id) {
          product = self.packages.filter(function (p) { return p.id === self.item.vendor_package_id; })[0];
        }
        if (!product) { return ''; }
        return product.name;
      },
    },
    methods: {
      openCalendar: function openCalendar() {
        var self = this;
        self.calendarTo = self.$f7.calendar.create({
          openIn: 'customModal',
          value: self.item.valid_to ? [new Date(self.item.valid_to)] : [],
          backdrop: true,
          closeByOutsideClick: false,
          on: {
            change: function change(c, v) {
              self.item.valid_to = new Date(v[0]).toJSON();
              self.enableSave();
            },
          },
        });
        self.calendarTo.once('closed', function () {
          self.calendarTo.destroy();
        });
        self.calendarTo.open();
      },
      formatValueDate: function formatValueDate(date) {
        var self = this;
        if (!date) { return ''; }
        return self.$moment(new Date(date)).format('YYYY-MM-DDTHH:mm');
      },
      onDateChange: function onDateChange(e) {
        var self = this;
        var value = e.target.value;
        clearTimeout(self.dateChangeTimeout);
        self.item.valid_to = new Date(value).toJSON();
        self.enableSave();
      },
      setKind: function setKind(kind) {
        var self = this;
        var prevKind = self.item.kind;
        if (self.item.kind === kind) { return; }
        if ((kind === 'fixed' || kind === 'voucher') && prevKind === 'percentage') {
          self.setAmount(0);
        } else if (kind === 'percentage') {
          self.setAmount(0.5);
        }
        self.item.kind = kind;
        self.enableSave();
      },
      setAmount: function setAmount(value) {
        var self = this;
        var newAmount = value;
        if (typeof newAmount === 'string') {
          newAmount = value.replace(/[¥ ]*/, '').replace(/,/g, '.').trim();
        } else { // eslint-disable-next-line
          if (newAmount >= 1) {
            newAmount = 1;
          } else {
            newAmount = Math.floor(newAmount * 1000 / 10);
            if (newAmount < 10) { newAmount = parseFloat(("0.0" + newAmount)); }
            else { newAmount = parseFloat(("0." + newAmount)); }
          }
        }
        self.item.amount = newAmount;
        self.$set(self.item, 'amount', newAmount);
        self.enableSave();
      },
      enableSave: function enableSave() {
        var self = this;
        self.showSave = true;
      },
      save: function save() {
        var self = this;
        self.showSave = false;
        if (typeof self.item.amount === 'string') {
          self.item.amount = parseFloat(self.item.amount);
          if (Number.isNaN(self.item.amount)) {
            self.item.amount = 0;
          }
        }
        if (self.item.vendor_product_id) {
          self.item.vendor_package_id = null;
        }
        if (self.item.vendor_package_id) {
          self.item.vendor_product_id = null;
        }
        API.savePromotion(self.item).then(function () {
          self.$events.$emit('invoicing:reloadPromotions');
          self.$f7router.back();
        });
      },
    },
  };

  /* script */
  var __vue_script__$g = script$g;

  /* template */
  var __vue_render__$g = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c(
      "f7-page",
      {
        staticClass: "invoicing-page",
        attrs: {
          id: "invoicing__promotion-details",
          "data-name": "invoicing__promotion-details"
        }
      },
      [
        _c(
          "f7-navbar",
          [
            _c("tommy-nav-back"),
            _vm._v(" "),
            _c("f7-nav-title", [_vm._v(_vm._s(_vm.pageTitle))]),
            _vm._v(" "),
            _c(
              "f7-nav-right",
              [
                _vm.showSave
                  ? _c("f7-link", {
                      attrs: { "icon-f7": "check" },
                      on: { click: _vm.save }
                    })
                  : _vm._e()
              ],
              1
            )
          ],
          1
        ),
        _vm._v(" "),
        _vm.item
          ? _c(
              "f7-list",
              { staticClass: "list-custom" },
              [
                _c("f7-list-input", {
                  attrs: {
                    label: _vm.$t("invoicing.promotion.name_label", "Name"),
                    placeholder: _vm.$t(
                      "invoicing.promotion.name_placeholder",
                      "Enter promotion name"
                    ),
                    type: "text",
                    value: _vm.item.name
                  },
                  on: {
                    input: function($event) {
                      _vm.item.name = $event.target.value;
                      _vm.enableSave();
                    }
                  }
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t(
                      "invoicing.promotion.description_label",
                      "Description"
                    )
                  }
                }),
                _vm._v(" "),
                _c("f7-list-input", {
                  attrs: {
                    placeholder: _vm.$t(
                      "invoicing.promotion.description_placeholder",
                      "Enter promotion description"
                    ),
                    type: "textarea",
                    resizable: "",
                    value: _vm.item.description
                  },
                  on: {
                    input: function($event) {
                      _vm.item.description = $event.target.value;
                      _vm.enableSave();
                    }
                  }
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t(
                      "invoicing.promotion.expires_label",
                      "Description"
                    )
                  }
                }),
                _vm._v(" "),
                _c(
                  "f7-list-input",
                  {
                    staticClass: "invoicing-valid-to-input",
                    attrs: {
                      title: _vm.$t("invoicing.order_details.due_date"),
                      type: "text",
                      readonly: "",
                      value: _vm.item.valid_to
                        ? _vm.$moment(_vm.item.valid_to).format("D MMM YYYY")
                        : ""
                    },
                    on: { focus: _vm.openCalendar }
                  },
                  [
                    _c("span", {
                      staticClass: "input-clear-button margin-right",
                      attrs: { slot: "inner" },
                      on: {
                        click: function($event) {
                          _vm.item.valid_to = null;
                          _vm.enableSave();
                        }
                      },
                      slot: "inner"
                    })
                  ]
                ),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t("invoicing.promotion.type_label")
                  }
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    checkbox: "",
                    title: _vm.$t("invoicing.promotion.type_voucher_label"),
                    checked: _vm.item.kind === "voucher"
                  },
                  on: {
                    change: function($event) {
                      return _vm.setKind("voucher")
                    }
                  }
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    checkbox: "",
                    title: _vm.$t("invoicing.promotion.type_fixed_label"),
                    checked: _vm.item.kind === "fixed"
                  },
                  on: {
                    change: function($event) {
                      return _vm.setKind("fixed")
                    }
                  }
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    checkbox: "",
                    title: _vm.$t("invoicing.promotion.type_percentage_label"),
                    checked: _vm.item.kind === "percentage"
                  },
                  on: {
                    change: function($event) {
                      return _vm.setKind("percentage")
                    }
                  }
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t(
                      "invoicing.promotion.amount_label",
                      "Discount amount"
                    )
                  }
                }),
                _vm._v(" "),
                _vm.item.kind === "fixed" || _vm.item.kind === "voucher"
                  ? _c("f7-list-input", {
                      attrs: {
                        placeholder: _vm.$t(
                          "invoicing.promotion.amount_placeholder",
                          "Enter promotion discount"
                        ),
                        type: "text",
                        value: _vm.item.amount ? "¥" + _vm.item.amount : ""
                      },
                      on: {
                        input: function($event) {
                          return _vm.setAmount($event.target.value)
                        }
                      }
                    })
                  : _vm._e(),
                _vm._v(" "),
                _vm.item.kind === "percentage"
                  ? _c(
                      "f7-list-item",
                      [
                        _c("f7-range", {
                          staticClass: "invoicing-range-slider",
                          attrs: {
                            value: _vm.item.amount,
                            min: 0,
                            max: 1,
                            step: 0.01,
                            "format-label": function(v) {
                              return Math.floor(v * 100) + "%"
                            },
                            label: ""
                          },
                          on: {
                            "range:changed": function(v) {
                              return _vm.setAmount(v)
                            }
                          }
                        }),
                        _vm._v(" "),
                        _c(
                          "div",
                          { staticClass: "invoicing-range-slider-value" },
                          [
                            _vm._v(
                              _vm._s(Math.floor(_vm.item.amount * 100)) + "%"
                            )
                          ]
                        )
                      ],
                      1
                    )
                  : _vm._e(),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t(
                      "invoicing.promotion.category_label",
                      "Category"
                    )
                  }
                }),
                _vm._v(" "),
                _c("f7-list-input", {
                  attrs: {
                    placeholder: _vm.$t(
                      "invoicing.promotion.category_label",
                      "Category"
                    ),
                    type: "text",
                    value: _vm.item.category
                  },
                  on: {
                    input: function($event) {
                      _vm.item.category = $event.target.value;
                      _vm.enableSave();
                    }
                  }
                }),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t("invoicing.promotion.max_uses_label")
                  }
                }),
                _vm._v(" "),
                _c("f7-list-input", {
                  attrs: {
                    placeholder: _vm.$t(
                      "invoicing.promotion.max_uses_placeholder"
                    ),
                    type: "number",
                    value: _vm.item.max_uses
                  },
                  on: {
                    input: function($event) {
                      _vm.item.max_uses = $event.target.value;
                      _vm.enableSave();
                    }
                  }
                }),
                _vm._v(" "),
                _vm.contacts
                  ? [
                      _c("f7-list-item", {
                        attrs: {
                          divider: "",
                          title: _vm.$t(
                            "invoicing.promotion.customer_label",
                            "Customer"
                          )
                        }
                      }),
                      _vm._v(" "),
                      _c(
                        "f7-list-item",
                        {
                          attrs: { title: _vm.customerTitle, link: "" },
                          on: {
                            click: function($event) {
                              _vm.customerPopupOpened = true;
                            }
                          }
                        },
                        [
                          _vm.customerAvatar
                            ? _c("tommy-circle-avatar", {
                                attrs: {
                                  slot: "media",
                                  data: _vm.customerAvatar
                                },
                                slot: "media"
                              })
                            : _vm._e()
                        ],
                        1
                      )
                    ]
                  : _vm._e(),
                _vm._v(" "),
                _c("f7-list-item", {
                  attrs: {
                    divider: "",
                    title: _vm.$t("invoicing.promotion.item_label", "Item")
                  }
                }),
                _vm._v(" "),
                _vm.products && _vm.packages
                  ? _c(
                      "f7-list-item",
                      {
                        attrs: { title: _vm.itemTitle, link: "" },
                        on: {
                          click: function($event) {
                            _vm.itemsPopupOpened = true;
                          }
                        }
                      },
                      [
                        _vm.itemAvatar
                          ? _c("tommy-circle-avatar", {
                              attrs: { slot: "media", url: _vm.itemAvatar },
                              slot: "media"
                            })
                          : _vm._e()
                      ],
                      1
                    )
                  : _vm._e()
              ],
              2
            )
          : _vm._e(),
        _vm._v(" "),
        _vm.item
          ? _c(
              "f7-popup",
              {
                attrs: { opened: _vm.customerPopupOpened },
                on: {
                  "popup:closed": function($event) {
                    _vm.customerPopupOpened = false;
                  }
                }
              },
              [
                _c(
                  "f7-view",
                  { attrs: { init: false } },
                  [
                    _c(
                      "f7-page",
                      { staticClass: "invoicing-page" },
                      [
                        _c(
                          "f7-navbar",
                          [
                            _c("f7-nav-title", [
                              _vm._v(
                                _vm._s(
                                  _vm.$t("invoicing.promotion.customer_label")
                                )
                              )
                            ]),
                            _vm._v(" "),
                            _c(
                              "f7-nav-right",
                              [
                                _c("f7-link", {
                                  attrs: { "popup-close": "", "icon-f7": "close" }
                                })
                              ],
                              1
                            )
                          ],
                          1
                        ),
                        _vm._v(" "),
                        _c("f7-searchbar", {
                          attrs: {
                            "search-container":
                              ".invoicing-promotion-customers-list"
                          }
                        }),
                        _vm._v(" "),
                        _c(
                          "f7-list",
                          { staticClass: "invoicing-promotion-customers-list" },
                          [
                            _vm._l(_vm.contacts, function(contact, index) {
                              return _c(
                                "f7-list-item",
                                {
                                  key:
                                    "contact-" + index + "-" + contact.friend_id,
                                  attrs: {
                                    title:
                                      (contact.first_name || "") +
                                      " " +
                                      (contact.last_name || ""),
                                    radio: "",
                                    checked:
                                      _vm.item.user_id === contact.friend_id
                                  },
                                  on: {
                                    click: function() {
                                      _vm.item.user_id = contact.friend_id;
                                      _vm.customerPopupOpened = false;
                                      _vm.enableSave();
                                    }
                                  }
                                },
                                [
                                  _c("tommy-circle-avatar", {
                                    attrs: { slot: "media", data: contact },
                                    slot: "media"
                                  })
                                ],
                                1
                              )
                            }),
                            _vm._v(" "),
                            _vm._l(_vm.$root.teamMembers, function(user) {
                              return _c(
                                "f7-list-item",
                                {
                                  key: "user-" + _vm.index + "-" + user.id,
                                  attrs: {
                                    title:
                                      (user.first_name || "") +
                                      " " +
                                      (user.last_name || ""),
                                    radio: "",
                                    checked: _vm.item.user_id === user.user_id
                                  },
                                  on: {
                                    click: function() {
                                      _vm.item.user_id = user.user_id;
                                      _vm.customerPopupOpened = false;
                                      _vm.enableSave();
                                    }
                                  }
                                },
                                [
                                  _c("tommy-circle-avatar", {
                                    attrs: { slot: "media", data: user },
                                    slot: "media"
                                  })
                                ],
                                1
                              )
                            })
                          ],
                          2
                        )
                      ],
                      1
                    )
                  ],
                  1
                )
              ],
              1
            )
          : _vm._e(),
        _vm._v(" "),
        _vm.item && _vm.products && _vm.packages
          ? _c(
              "f7-popup",
              {
                attrs: { opened: _vm.itemsPopupOpened },
                on: {
                  "popup:closed": function($event) {
                    _vm.itemsPopupOpened = false;
                  }
                }
              },
              [
                _c(
                  "f7-view",
                  { attrs: { init: false } },
                  [
                    _c(
                      "f7-page",
                      { staticClass: "invoicing-page" },
                      [
                        _c(
                          "f7-navbar",
                          [
                            _c("f7-nav-title", [
                              _vm._v(
                                _vm._s(_vm.$t("invoicing.promotion.item_label"))
                              )
                            ]),
                            _vm._v(" "),
                            _c(
                              "f7-nav-right",
                              [
                                _c("f7-link", {
                                  attrs: { "popup-close": "", "icon-f7": "close" }
                                })
                              ],
                              1
                            )
                          ],
                          1
                        ),
                        _vm._v(" "),
                        _c("f7-searchbar", {
                          attrs: {
                            "search-container": ".invoicing-promotion-items-list",
                            "disable-button": false
                          }
                        }),
                        _vm._v(" "),
                        _c(
                          "f7-list",
                          { staticClass: "invoicing-promotion-items-list" },
                          [
                            _vm.products.length
                              ? _c("f7-list-item", {
                                  attrs: {
                                    divider: "",
                                    title: _vm.$t(
                                      "invoicing.item_service_management.items_tab"
                                    )
                                  }
                                })
                              : _vm._e(),
                            _vm._v(" "),
                            _vm._l(_vm.products, function(product) {
                              return _c(
                                "f7-list-item",
                                {
                                  key: product.id,
                                  attrs: {
                                    title: product.name,
                                    radio: "",
                                    checked:
                                      _vm.item.vendor_product_id === product.id
                                  },
                                  on: {
                                    click: function() {
                                      _vm.item.vendor_product_id = product.id;
                                      _vm.item.vendor_package_id = null;
                                      _vm.itemsPopupOpened = false;
                                      _vm.enableSave();
                                    }
                                  }
                                },
                                [
                                  _c("tommy-circle-avatar", {
                                    attrs: {
                                      slot: "media",
                                      url: product.image_url
                                    },
                                    slot: "media"
                                  })
                                ],
                                1
                              )
                            }),
                            _vm._v(" "),
                            _vm.packages.length
                              ? _c("f7-list-item", {
                                  attrs: {
                                    divider: "",
                                    title: _vm.$t(
                                      "invoicing.item_service_management.packages_tab"
                                    )
                                  }
                                })
                              : _vm._e(),
                            _vm._v(" "),
                            _vm._l(_vm.packages, function(pkg) {
                              return _c(
                                "f7-list-item",
                                {
                                  key: pkg.id,
                                  attrs: {
                                    title: pkg.name,
                                    radio: "",
                                    checked: _vm.item.vendor_package_id === pkg.id
                                  },
                                  on: {
                                    click: function() {
                                      _vm.item.vendor_product_id = null;
                                      _vm.item.vendor_package_id = pkg.id;
                                      _vm.itemsPopupOpened = false;
                                      _vm.enableSave();
                                    }
                                  }
                                },
                                [
                                  _c("tommy-circle-avatar", {
                                    attrs: { slot: "media", url: pkg.image_url },
                                    slot: "media"
                                  })
                                ],
                                1
                              )
                            })
                          ],
                          2
                        )
                      ],
                      1
                    )
                  ],
                  1
                )
              ],
              1
            )
          : _vm._e()
      ],
      1
    )
  };
  var __vue_staticRenderFns__$g = [];
  __vue_render__$g._withStripped = true;

    /* style */
    var __vue_inject_styles__$g = undefined;
    /* scoped */
    var __vue_scope_id__$g = undefined;
    /* module identifier */
    var __vue_module_identifier__$g = undefined;
    /* functional template */
    var __vue_is_functional_template__$g = false;
    /* style inject */
    
    /* style inject SSR */
    

    
    var PromotionDetailsPage = normalizeComponent_1(
      { render: __vue_render__$g, staticRenderFns: __vue_staticRenderFns__$g },
      __vue_inject_styles__$g,
      __vue_script__$g,
      __vue_scope_id__$g,
      __vue_is_functional_template__$g,
      __vue_module_identifier__$g,
      undefined,
      undefined
    );

  var routes = [
    {
      path: '/invoicing/',
      component: IndexPage,
    },
    {
      path: '/invoicing/settings/',
      component: SettingsPage,
    },
    {
      path: '/invoicing/item-service-management/',
      component: ItemServiceManagementPage,
    },
    {
      path: '/invoicing/list-management/',
      component: ListManagementPage,
    },
    {
      path: '/invoicing/promotion-management/',
      component: PromotionManagementPage,
    },
    {
      path: '/invoicing/list-add/',
      component: ListAddPage,
    },
    {
      path: '/invoicing/list-edit/date-range/',
      component: DateRangePage,
    },
    {
      path: '/invoicing/list-edit/:listId/',
      component: ListEditPage,
    },
    {
      path: '/invoicing/tag-select/',
      component: TagSelectPage,
    },
    {
      path: '/invoicing/product-details/:id?/',
      component: ProductDetailsPage,
    },
    {
      path: '/invoicing/package-details/:id?/',
      component: PackageDetailsPage,
    },
    {
      path: '/invoicing/range-select/',
      component: RangeSelectPage,
    },
    {
      path: '/invoicing/order-details/:id?/',
      popup: {
        async: function async(to, from, resolve) {
          resolve({
            component: API.isNurse ? OrderDetailsNursePage : OrderDetailsPage,
          });
        },
      },
    },
    {
      path: '/invoicing/promotion-details/:id?/',
      component: PromotionDetailsPage,
    } ];

  return routes;

}());
