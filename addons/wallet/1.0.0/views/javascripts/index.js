import IndexController from './controllers/index'
import CardDetailsController from './controllers/card-details';
import TransactionDetailsController from './controllers/transaction-details';
import SettingsController from './controllers/settings';

// == Router
window.tommy.app.f7.onPageInit('wallet__index', IndexController.init)
window.tommy.app.f7.onPageBeforeRemove('wallet__index', IndexController.uninit)

window.tommy.app.f7.onPageBeforeInit('wallet__card_details', CardDetailsController.init)
window.tommy.app.f7.onPageBeforeRemove('wallet__card_details', CardDetailsController.uninit)

window.tommy.app.f7.onPageInit('wallet__transaction_details', TransactionDetailsController.init)
window.tommy.app.f7.onPageBeforeRemove('wallet__transaction_details', TransactionDetailsController.uninit)

window.tommy.app.f7.onPageInit('wallet__settings', SettingsController.init)
window.tommy.app.f7.onPageBeforeRemove('wallet__settings', SettingsController.uninit)

// Helpers
window.tommy.app.t7.registerHelper('wallet__formatTransactionAmount', item => {
  return `${item.status === 'paid' ? '-' : '+'} ${item.amount_cents / 100}`;
});
window.tommy.app.t7.registerHelper('wallet__formatTransactionStatus', status => {
  return status[0].toUpperCase() + status.substr(1);
});
window.tommy.app.t7.registerHelper('wallet__formatTransactionDate', date => {
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
