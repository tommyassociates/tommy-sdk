import api from './api';

const tommy = window.tommy;
const transaction = {
  cache: {
    popup: null,
    params: null,
  },
  selectWallet(cards, callback) {
    const { f7 } = tommy.app;
    const walletButtons = cards.map((card) => {
      return {
        text: card.name,
        onClick() {
          if (callback) callback(card);
        },
      }
    });
    f7.actions(walletButtons);
  },
  showLoader() {
    if (transaction.cache.$popup.find('.transaction-preloader').length) return;
    transaction.cache.$popup.append('<div class="transaction-preloader"></div>')
  },
  hideLoader() {
    transaction.cache.$popup.find('.transaction-preloader').remove();
  },
  clear() {
    transaction.cache.$popup.remove();
    transaction.cache = {};
  },
  renderError(error) {
    const { $popup } = transaction.cache;
    const message = typeof error === 'string' ? message : (error && error.message || '')
    const html = tommy.tplManager.render('wallet__transactionPopupStatus', {
      title: tommy.i18n.t('transaction_popup.error_title', { defaultValue: 'Fail' }),
      status: 'error',
      message,
    });
    transaction.cache.onReportBack = () => $popup.html(html);
    $popup.html(html);
  },
  renderSuccess(data) {
    const { $popup } = transaction.cache;
    const { payee_name, card_name, amount } = data;
    const html = tommy.tplManager.render('wallet__transactionPopupStatus', {
      title: tommy.i18n.t('transaction_popup.success_title', { defaultValue: 'Success' }),
      status: 'success',
      message: tommy.i18n.t('transaction_popup.success_message', {
        defaultValue: 'You sent ¥{{amount}}.<br>To {{to}}<br>From {{from}}',
        amount,
        to: payee_name,
        from: card_name,
      }),
    });
    transaction.cache.onReportBack = () => $popup.html(html);
    $popup.html(html);
  },
  createTransaction(data) {
    const { card_name } = data;
    transaction.showLoader();
    api.createWalletTransaction(data).then((response) => {
      transaction.hideLoader();
      const transactionDetails = Object.assign({}, response || {}, { card_name });
      transaction.cache.transactionDetails = transactionDetails;

      if (transactionDetails.status && transactionDetails.status !== 'failed') {
        transaction.renderSuccess(transactionDetails);
        if (transaction.cache.onSuccess) transaction.cache.onSuccess();
      } else if (transactionDetails.status === 'failed'){
        transaction.renderError(Object.assign(transactionDetails, {
          message: tommy.i18n.t('transaction_popup.error_insufficient', { defaultValue: 'Sorry. Your Tommy account balance is insufficient. Please use other payment methods' }),
        }));
        if (transaction.cache.onError) transaction.cache.onError();
      }
    }).catch((error) => {
      const transactionDetails = Object.assign({}, data, { status: 'failed' });
      transaction.hideLoader();
      transaction.cache.transactionDetails = transactionDetails;
      transaction.renderError(error);
      if (transaction.cache.onError) transaction.cache.onError();
    });
  },
  viewReport() {
    const { f7 } = tommy.app;
    const { $popup, transactionDetails } = transaction.cache;
    const html = `
      <div class="page navbar-fixed">
        <div class="navbar no-border">
          <div class="navbar-inner">
            <div class="left">
              <a href="#" class="link icon-only transaction-popup-report-back"><i class="icon f7-icons">chevron_left</i></a>
            </div>
            <div class="center">${tommy.i18n.t('transaction_details.title', { defaultValue: 'Transaction Details' })}</div>
            <div class="right">
              <a href="#" class="link icon-only close-popup" data-popup=".wallet__transaction-popup">
                <i class="icon f7-icons">close</i>
              </a>
            </div>
          </div>
        </div>
        <div class="page-content transaction-popup-fade-in">
         ${tommy.tplManager.render('wallet__transactionDetailsTemplate', transactionDetails)}
        </div>
      </div>
    `;
    $popup.html(html);
    f7.sizeNavbars($popup);
  },
  render() {
    const { $popup, params } = transaction.cache;
    const { addon_id, addon_install_id, payee_name, amount } = params;

    transaction.showLoader();

    // get wallet cards
    api.getWalletCards().then((cards) => {
      const multiple = cards.length > 1;
      let { id: wallet_card_id, wallet_account_id, name: card_name } = cards[0];

      const html = tommy.tplManager.render('wallet__transactionPopupDetails', {
        payee_name,
        amount,
        card_name,
        multiple,
      });

      transaction.hideLoader();
      $popup.append(html);

      $popup.on('click', '.transaction-popup-select-wallet', () => {
        if (!multiple) return;
        transaction.selectWallet(cards, (card) => {
          card_name = card.name;
          wallet_card_id = card.id;
          wallet_account_id = card.wallet_account_id;
          $popup.find('.transaction-popup-select-wallet').text(card_name);
        });
      });
      $popup.once('click', '.transaction-popup-confirm-button', () => {
        transaction.createTransaction({
          addon_id,
          addon_install_id,
          payee_name,
          amount,
          wallet_card_id,
          wallet_account_id,
          card_name,
        });
      });
      $popup.on('click', '.transaction-popup-report-button', () => {
        $popup.addClass('transaction-popup-status-rendered')
        transaction.viewReport();
      });
      $popup.on('click', '.transaction-popup-report-back', () => {
        if (transaction.cache.onReportBack) transaction.cache.onReportBack();
      });
    });
  },
  init(params = {}, onSuccess, onError) {
    const { f7 } = tommy.app;
    transaction.cache.params = params;
    transaction.cache.onSuccess = onSuccess;
    transaction.cache.onError = onError;

    const popup = f7.popup(`
      <div class="popup tablet-fullscreen wallet__transaction-popup"></div>
    `);
    const $popup = $$(popup);

    transaction.cache.popup = popup;
    transaction.cache.$popup = $popup;

    $popup.on('popup:opened', () => {
      transaction.render();
    });
    $popup.on('popup:closed', () => {
      transaction.clear();
    });
  }
};
export default function (params, onSuccess, onError) {
  if (transaction.cache.popup) return;
  transaction.init(params, onSuccess, onError);
}