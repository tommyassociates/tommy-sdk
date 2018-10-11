import API from './api'
import IndexController from './controllers/index'
import TransactionDetailsController from './controllers/transaction-details'
import TransactionAddController from './controllers/transaction-add'
import ListAddController from './controllers/list-add'
import ListEditController from './controllers/list-edit'
import ListManagementController from './controllers/list-management'
import BoardSettingsController from './controllers/board-settings'
import WalletBalanceController from './controllers/wallet-balance';

import formatDateRange from './format-date-range';
import currencyMap from './currency-map';
import formatAmountRange from './format-amount-range';

//
// == Router

window.tommy.app.f7.onPageInit('wallet_accounts__index', IndexController.init)
window.tommy.app.f7.onPageBack('wallet_accounts__index', IndexController.uninit)
window.tommy.app.f7.onPageAfterAnimation('wallet_accounts__index', IndexController.invalidate)
window.tommy.app.f7.onPageInit('wallet_accounts__board-settings', BoardSettingsController.init)
window.tommy.app.f7.onPageInit('wallet_accounts__list-add', ListAddController.init)
window.tommy.app.f7.onPageInit('wallet_accounts__list-edit', ListEditController.init)
window.tommy.app.f7.onPageInit('wallet_accounts__list-management', ListManagementController.init)
window.tommy.app.f7.onPageAfterAnimation('wallet_accounts__list-management', ListManagementController.render)
window.tommy.app.f7.onPageInit('wallet_accounts__transaction-add', TransactionAddController.init)
window.tommy.app.f7.onPageInit('wallet_accounts__transaction_details', TransactionDetailsController.init)
window.tommy.app.f7.onPageBeforeRemove('wallet_accounts__transaction_details', TransactionDetailsController.uninit)
window.tommy.app.f7.onPageInit('wallet_accounts__wallet-balance', WalletBalanceController.init)


//
// == Template7 Helpers

window.tommy.app.t7.registerHelper('wallet_accounts__checklistNumCompleted', checklist => {
  let ret = ''
  if (checklist && checklist.items) {
    const completed = checklist.items.filter(value => value.complete)
    ret += completed.length
    ret += '/'
    ret += checklist.items.length
  }
  return ret
})

window.tommy.app.t7.registerHelper('wallet_accounts__displayStatus', status => {
  return API.translateStatus(status)
})

window.tommy.app.t7.registerHelper('wallet_accounts__displayStatuses', statuses => {
  if (statuses) {
    return statuses.map(x => API.translateStatus(x)).join(', ')
  } else {
    return 'All'
  }
})

window.tommy.app.t7.registerHelper('wallet_accounts__statusSelectOptions', statuses => {
  let ret = ''
  for (let i = 0; i < API.STATUSES.length; i++) {
    const status = API.STATUSES[i]
    const selected = statuses && statuses.indexOf(status) !== -1
    ret += '<option value="' + status + '" ' + (selected ? 'selected' : '') + '>' + (API.translateStatus(status)) + '</option>'
  }
  return ret
})

window.tommy.app.t7.registerHelper('wallet_accounts__ifCanEditList', (list, options) => {
    var account = window.tommy.config.getCurrentAccount()
    // BUG: Due to some unknown bug `this` is undefined in this function,
    // so substituting with the `list` variable for return variables
    // console.log('wallet_accounts__canEditList', this, list, options)

    // Default lists (the list automatically created for each team member) can
    // only be edited by admins
    if (list.permission_to.indexOf('update') !== -1)
      return options.fn(list, options.data)
    else
      return options.inverse(list, options.data)
})

window.tommy.app.t7.registerHelper('wallet_accounts__displayDateRange', range => {
  return formatDateRange(range);
})

window.tommy.app.t7.registerHelper('wallet_accounts__displayTransactionAmount', (min, max) => {
  return formatAmountRange(min, max);
})


window.tommy.app.t7.registerHelper('wallet_accounts__formatTransactionAmount', item => {
  return `${item.status === 'paid' || item.status === 'failed' ? '-' : '+'} ${currencyMap(item.currency)}${item.amount}`;
});
window.tommy.app.t7.registerHelper('wallet_accounts__currencySymbol', code => {
  return currencyMap(code);
});
window.tommy.app.t7.registerHelper('wallet_accounts__formatTransactionStatus', status => {
  return status[0].toUpperCase() + status.substr(1);
});
window.tommy.app.t7.registerHelper('wallet_accounts__formatTransactionDate', date => {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();

  let month = d.getMonth() + 1;
  if (month < 10) month = `0${month}`;

  let day = d.getDate();
  if (day < 10) day = `0${day}`;

  let hours = d.getHours();
  if (hours < 10) hours = `0${hours}`;

  let minutes = d.getMinutes();
  if (minutes < 10) minutes = `0${minutes}`;

  return `${year}-${month}-${day} ${hours}:${minutes}`;
});
