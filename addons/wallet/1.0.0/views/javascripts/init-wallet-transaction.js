import api from './api';

const tommy = window.tommy;
const transaction = {
  popup: null,
  params: null,
  showLoader() {
    if (transaction.$popup.find('.transaction-preloader').length) return;
    transaction.$popup.append('<div class="transaction-preloader"></div>')
  },
  hideLoader() {
    transaction.$popup.find('.transaction-preloader').remove();
  },
  clear() {
    transaction.$popup.remove();
    transaction.popup = null;
    transaction.$popup = null;
    transaction.params = null;
    transaction.onSuccess = null;
    transaction.onError = null;
  },
  create(data) {
    const { card_name } = data;
    transaction.showLoader();
    api.createWalletTransaction(data).then((response) => {
      transaction.renderSuccess(Object.assign({}, response || {}, { card_name }));
      if (transaction.onSuccess) transaction.onSuccess();
    }).catch((error) => {
      transaction.hideLoader();
      transaction.renderError(error);
      if (transaction.onError) transaction.onError();
    });
  },
  renderError(error) {
    const { $popup } = transaction;
    const html = tommy.tplManager.render('wallet__transactionPopupStatus', {
      title: window.tommy.i18n.t('transaction_popup.error_title', { defaultValue: 'Fail' }),
      status: 'error',
      message: error.message || '',
    });
    transaction.$popup.html(html);
  },
  renderSuccess(data) {
    const { $popup } = transaction;
    const { payee_name, card_name, amount } = data;
    const html = tommy.tplManager.render('wallet__transactionPopupStatus', {
      title: window.tommy.i18n.t('transaction_popup.success_title', { defaultValue: 'Success' }),
      status: 'success',
      message: window.tommy.i18n.t('transaction_popup.success_message', {
        defaultValue: 'You sent ¥{{amount}}.<br>To {{to}}<br>From {{from}}',
        amount,
        to: payee_name,
        from: card_name,
      }),
    });
    transaction.$popup.html(html);
  },
  render() {
    const { $popup, params } = transaction;
    const { addon_id, addon_install_id, payee_name, amount } = params;

    transaction.showLoader();

    // get wallet cards
    api.getWalletCards().then((cards) => {
      const { id: wallet_card_id, wallet_account_id, name: card_name } = cards[0];

      const html = tommy.tplManager.render('wallet__transactionPopupDetails', {
        payee_name,
        amount,
        card_name,
      });

      transaction.hideLoader();
      transaction.$popup.append(html);

      // send transaction
      function onConfirmClick(e) {
        e.preventDefault();
        $popup.find('.transaction-popup-confirm-button').off('click', onConfirmClick);

        transaction.create({
          addon_id,
          addon_install_id,
          payee_name,
          amount,
          wallet_card_id,
          wallet_account_id,
          card_name,
        });
      }
      $popup.find('.transaction-popup-confirm-button').on('click', onConfirmClick);
    });
  },
  init(params = {}, onSuccess, onError) {
    const { f7, t7 } = tommy.app;
    transaction.params = params;
    transaction.onSuccess = onSuccess;
    transaction.onError = onError;

    const popup = f7.popup(`
      <div class="popup tablet-fullscreen wallet__transaction-popup"></div>
    `);
    const $popup = $$(popup);

    transaction.popup = popup;
    transaction.$popup = $popup;

    $popup.on('popup:opened', () => {
      transaction.render();
    });
    $popup.on('popup:closed', () => {
      transaction.clear();
    });
  }
};
export default function (params, onSuccess, onError) {
  if (transaction.popup) return;
  transaction.init(params, onSuccess, onError);
}