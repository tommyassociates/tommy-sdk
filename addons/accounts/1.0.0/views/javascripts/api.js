import IndexController from './controllers/index'

const API = {
  listsLoaded: false,
  transactionsLoaded: false,
  cache: {},

  initCache () {
    API.cache = {
      lists: {},
      transactions: {}
    }
  },

  getOrderedLists () {
    if (!API.cache['lists']) return []
    const lists = Object.values(API.cache['lists'])
    if (!lists.length) return []
    return lists.sort(function(a, b) {
      return a.data.position - b.data.position // ascending order
    })
  },

  addTransaction (item) {
    IndexController.invalidateLists = true // rerender lists
    API.cache['transactions'][item.id] = item
    console.log('transaction added', item)
  },

  addTransactions (items) {
    API.transactionsLoaded = true
    if (items && items.length) {
      for (let i = 0; i < items.length; i++) {
        if (Array.isArray(items[i]))
          API.addTransactions(items[i])
        else
          API.addTransaction(items[i])
      }
    }
  },

  getListTransactions (listId) {
    const list = API.cache['lists'][listId]
    const transactions = []
    for (const transactionId in API.cache['transactions']) {
      const transaction = API.cache['transactions'][transactionId]

      if (list.filters && transaction.filters) {

        // Filter on tags
        const transactionTags = transaction.filters.map(x => x.name)
        const listTags = list.filters.map(x => x.name)
        const matchTags = transactionTags.filter(x => listTags.indexOf(x) !== -1)
        let matches = !!matchTags.length || (!transactionTags.length && !listTags.length)
        console.log('transaction matches list tags', transaction.name, transaction.filters, list.name, list.filters, matches)

        // Filter on status
        if (matches && list.data.statuses) {
          matches = list.data.statuses.indexOf(transaction.status) !== -1
          console.log('transaction matches list statuses', transaction.name, transaction.status, list.name, list.statuses, matches)
        }

        if (matches) {
          transactions.push(transaction)
        }
      }
    }

    return transactions
  },

  loadListTransactions (list) {
    if (list._transactionsLoaded) {
      console.log('transactions already loaded', list) // params
      return
    }

    // Set the internal `_transactionsLoaded` flag.
    // Transactions won't be reloaded until this is set to false
    list._transactionsLoaded = true

    // let name, tags, params, request, requests = []
    const name = window.tommy.config.getCurrentUserName()
    const tags = [ name ]
    if (list.data && list.filters) {
      for (let i = 0; i < list.filters.length; i++) {
        tags.push(list.filters[i].name)
      }
    }

    const params = {
      addon: 'accounts',
      kind: 'Transaction',
      tags: tags,
      with_filters: true,
      with_permission_to: true
    }
    if (list.data.date_range) {
      params.date_range = list.data.date_range;
    }
    if (list.data.statuses)
      params.status = list.data.statuses

    return window.tommy.api.getFragments(params)
  },

  loadTransactions () {
    console.log('load transactions')

    const requests = []
    for (const listId in API.cache['lists']) {
      const list = API.cache['lists'][listId]
      const request = API.loadListTransactions(list)
      if (request)
        requests.push(request)
    }

    return Promise.all(requests).then(API.addTransactions)
  },

  addTransactionActivity (transaction, type, text) {
    const currentUser = window.tommy.config.getCurrentUser()
    const activity = {
      type,
      text,
      time: new Date(),
      user_id: currentUser.id,
      user_name: currentUser.first_name
    }

    if (!transaction.data) { transaction.data = {} }
    if (!transaction.data.activity) { transaction.data.activity = [] }
    transaction.data.activity.unshift(activity)

    return activity
  },

  saveTransaction (transaction) {
    console.log('save transaction', transaction)
    if (!transaction.name) {
      alert('Transaction name must be set')
      return
    }

    IndexController.invalidateLists = true // rerender lists

    transaction.addon = 'accounts'
    transaction.kind = 'Transaction'
    transaction.with_filters = true
    transaction.with_permission_to = true
    if (!transaction.id) { API.addTransactionActivity(transaction, 'status', window.tommy.i18n.t('transaction.created_a_transaction')) }
    if (!transaction.status) { transaction.status = API.STATUSES[0] }
    if (!transaction.start_at) { transaction.start_at = (new Date).getTime() }

    // Specify the access permissions this resource will belong to
    if (!transaction.id) {
      transaction.with_permissions = [ 'transaction_create_access', 'transaction_edit_access' ]
      const actor = window.tommy.addons.getCurrentActor()
      if (actor) {
        if (!transaction.filters) transaction.filters = [];
        transaction.filters.push({
          context: 'members',
          name: `${actor.first_name} ${actor.last_name}`,
          user_id: actor.user_id
        })
      }
    }

    const params = Object.assign({}, transaction, { data: JSON.stringify(transaction.data) })
    if (transaction.id) {
      return window.tommy.api.updateFragment(transaction.id, params).then(API.addTransaction)
    } else {
      return window.tommy.api.createFragment(params).then(API.addTransaction)
    }
  },

  addList (item) {
    API.cache['lists'][item.id] = item
    console.log('added transaction list', item)
  },

  addLists (items) {
    API.listsLoaded = true
    if (items && items.length) {
      for (let i = 0; i < items.length; i++) {
        API.addList(items[i])
      }
    }
  },

  loadLists (params) {
    console.log('load transaction lists', params)

    params = Object.assign({
      addon: 'accounts',
      kind: 'TransactionList',
      with_filters: true,
      with_permission_to: true
    }, params)
    return window.tommy.api.getFragments(params).then(API.addLists)
  },

  deleteList (listId) {
    IndexController.invalidateLists = true
    delete API.cache['lists'][listId]
    console.log('delete list', listId)
    return window.tommy.api.deleteFragment(listId)
  },

  saveList (list) {
    console.log('save list', list)

    // Set the internal flags to reload transactions for this list
    API.transactionsLoaded = false
    list._transactionsLoaded = false
    IndexController.invalidateLists = true // rerender lists

    list.addon = 'accounts'
    list.kind = 'TransactionList'
    list.with_filters = true
    list.with_permission_to = true
    if (!list.data) { list.data = {} }
    if (typeof (list.data.position) === 'undefined') { list.data.position = Object.keys(API.cache['lists']).length }
    if (typeof (list.data.active) === 'undefined') { list.data.active = true }
    if (typeof (list.data.show_fast_add) === 'undefined') { list.data.show_fast_add = true }

    // Specify the access permissions this resource will belong to
    if (!list.id)
      list.with_permissions = [ 'transaction_list_read_access', 'transaction_list_edit_access' ]

    const params = Object.assign({}, list, {
      data: JSON.stringify(list.data),
      filters: JSON.stringify(list.filters)
    })
    if (list.id) {
      return window.tommy.api.updateFragment(list.id, params).then(API.addList)
    }
    else {
      return window.tommy.api.createFragment(params).then(API.addList)
    }
  },

  currentUserTag () {
    return {
      context: 'members',
      name: window.tommy.config.getCurrentUserName(),
      user_id: window.tommy.config.getCurrentUserId()
    }
  },

  createDefaultList () {
    console.log('creating deafult transaction list')
    let list = {
      name: window.tommy.i18n.t('index.default-transaction-name'),
      data: {
        default: true
      },

      // Default list filters show transactions tagged with current user
      filters: [ API.currentUserTag() ]
    }
    return API.saveList(list)
  },

  hasDefaultList () {
    return API.cache['lists'] && Object.values(API.cache['lists']).filter(x => x.data.default).length > 0
  },

  initPermissionSelect (page, name, resource_id) {
    console.log('init permission selects', name, resource_id)
    const params = {
      resource_id: resource_id,
      with_filters: true
    }
    window.tommy.api.getInstalledAddonPermission('accounts', name, params).then(permission => {
      console.log('installed addon permission', permission)
      // for (var i = 0; i < permissions.length; i++) {
        // const wantedPermission = wantedPermissions.filter(x => x.name == permissions[i].name)[0]
        // if (!wantedPermission) continue
        // const permission = Object.assign({}, permissions[i], wantedPermission)
        // console.log('init permissions', permission)
      permission.resource_id = resource_id
      window.tommy.tplManager.appendInline('accounts__tagSelectTemplate', permission, page.container)
      API.initTagSelect(page, permission)
      // }
    })
  },

  initTagSelect (page, permission) {
    const $tagSelect = $$(page.container).find('.tag-select[data-permission-name="' + permission.name + '"]') //.find('') //$page.find('#addon-permissions-form .tag-select')
    console.log('init tag select', permission, $tagSelect.dataset())
    window.tommy.tagSelect.initWidget($tagSelect, permission.filters, function(data) {
      console.log('save permission tags', permission, data)
      window.tommy.api.updateInstalledAddonPermission('accounts', permission.name, {
        resource_id: permission.resource_id, // pass the resource_id for resource specific permissions
        with_filters: true,
        filters: JSON.stringify(data) // data
      })
    })
  },

  isTablet () {
    return window.innerWidth >= 630
  },

  STATUSES: [ 'Unassigned', 'Assigned', 'Processing', 'Completed', 'Closed', 'Archive Transaction', 'Cancel' ],

  translateStatus (status) {
    if (status)
      return window.tommy.i18n.t('status.' + window.tommy.util.underscore(status), { defaultValue: status })
  },

  untranslateStatus (translatedStatus) {
    for (let i = 0; i < API.STATUSES.length; i++) {
      if (API.translateStatus(API.STATUSES[i]) === translatedStatus)
        return API.STATUSES[i]
    }
  },

  translatedStatuses () {
    const statuses = []
    for (let i = 0; i < API.STATUSES.length; i++) {
      statuses.push(API.translateStatus(API.STATUSES[i]))
    }
    return statuses
  }
}

export default API
