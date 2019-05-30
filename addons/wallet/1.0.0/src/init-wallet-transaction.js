import currencyMap from './utils/currency-map';
import API from './api';
import formatTransactionAmount from './utils/format-transaction-amount';
import formatTransactionDate from './utils/format-transaction-date';
import formatTransactionStatus from './utils/format-transaction-status';

const tommy = window.tommy;
const i18n = tommy.i18n;

let wechatInstalled;
if (window.cordova) {
  document.addEventListener('deviceready', () => {
    if (!window.Wechat) return;
    window.Wechat.isInstalled((installed) => {
      wechatInstalled = installed;
      // alert("Wechat installed: " + (installed ? "Yes" : "No"));
    }, (/* reason */) => {
      // alert("Failed: " + reason);
    });
  });
}

function renderPopup(data) {
  return `
  <div class="page">
    <div class="navbar">
      <div class="navbar-inner">
        <div class="left">
          <i class="transaction-popup-logo"></i>
        </div>
        <div class="right">
          <a href="#" class="link icon-only popup-close" data-popup=".wallet__transaction-popup">
            <i class="icon f7-icons">close</i>
          </a>
        </div>
      </div>
    </div>
    <a class="transaction-popup-confirm-button transaction-popup-fade-in">${i18n.t('wallet.transaction_popup.confirm_button', 'Confirm')}</a>
    <div class="page-content">
      <i class="transaction-popup-wallet-icon transaction-popup-fade-in"></i>
      <div class="transaction-popup-list transaction-popup-fade-in">
        <div class="transaction-popup-list-item">${i18n.t('wallet.transaction_popup.pay_label', 'Pay')}</div>
        <div class="transaction-popup-list-item">${data.payee_name}</div>
        <div class="transaction-popup-list-item">${data.currency}${data.amount}</div>
        <div class="transaction-popup-list-item">${i18n.t('wallet.transaction_popup.using_label', 'Using')}</div>
          <div class="transaction-popup-list-item transaction-popup-list-item-link transaction-popup-select-wallet">${data.card_name}</div>
      </div>
    </div>
  </div>
  `;
}
function renderPopupStatus(data) {
  return `
  <div class="page">
    <div class="navbar">
      <div class="navbar-inner">
        <div class="left">
          <i class="transaction-popup-logo"></i>
        </div>
        <div class="right">
          <a href="#" class="link icon-only popup-close" data-popup=".wallet__transaction-popup">
            <i class="icon f7-icons">close</i>
          </a>
        </div>
      </div>
    </div>
    ${data.paymentMethod === 'card' ? `
    <a class="transaction-popup-report-button transaction-popup-fade-in">${i18n.t('wallet.transaction_popup.report_button', 'View Report')}</a>
    ` : ''}
    <div class="page-content">
      <i class="transaction-popup-status-icon transaction-popup-${data.status}-icon"></i>
      <div class="transaction-popup-status-title">${data.title}</div>
      <div class="transaction-popup-status-message">${data.message}</div>
    </div>
  </div>
  `.trim();
}

function renderPopupReport(transaction, data) {
  return `
  <div class="page">
    <div class="navbar">
      <div class="navbar-inner">
        <div class="left">
          <a href="#" class="link icon-only transaction-popup-report-back"><i class="icon f7-icons">chevron_left</i></a>
        </div>
        <div class="title">${i18n.t('wallet.transaction_details.title', 'Transaction Details')}</div>
        <div class="right">
          <a href="#" class="link icon-only popup-close" data-popup=".wallet__transaction-popup">
            <i class="icon f7-icons">close</i>
          </a>
        </div>
      </div>
    </div>
    <div class="page-content transaction-popup-fade-in">
      <div class="wallet-transaction-header">
        <div class="wallet-transaction-header-wrap">
          <div class="wallet-transaction-icon">
            ${transaction.icon_url ? `
              <img src="${transaction.icon_url}">
            ` : `
              <i class="wallet-transaction-icon-placeholder"></i>
            `}
          </div>
          <div class="wallet-transaction-payment-info">
            <div class="wallet-transaction-payment-name">${transaction.payee_name}</div>
            <div class="wallet-transaction-payment-amount">${formatTransactionAmount(transaction)}</div>
          </div>
        </div>
        <div class="wallet-transaction-status">${formatTransactionStatus(i18n.t(`wallet.transaction_status.${transaction.status.toLowerCase()}`, transaction.status))}</div>
      </div>
      <div class="list wallet-transaction-details-list no-hairlines">
        <ul>
          ${transaction.card_name ? `
          <li class="item-content">
            <div class="item-inner">
              <div class="item-title">${i18n.t('wallet.transaction_details.payment_label', 'Payment')}</div>
              <div class="item-after">${transaction.card_name}</div>
            </div>
          </li>
          ` : ''}
          <li class="item-content">
            <div class="item-inner">
              <div class="item-title">${i18n.t('wallet.transaction_details.time_label', 'Time')}</div>
              <div class="item-after">${formatTransactionDate(transaction.paid_at)}</div>
            </div>
          </li>
          <li class="item-content">
            <div class="item-inner">
              <div class="item-title">${i18n.t('wallet.transaction_details.payee_label', 'Payee')}</div>
              <div class="item-after">${transaction.payee_name}</div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
  `;
}

const transaction = {
  cache: {
    popup: null,
    params: null,
  },
  selectWallet(currentMethod, cards, callback) {
    const { f7 } = tommy.app;

    const card = cards && cards[0];
    const sheet = f7.sheet.create({
      backdrop: true,
      content: `
        <div class="sheet-modal wallet-payments-sheet">
          <div class="toolbar">
            <div class="toolbar-inner">
              <a class="link color-gray sheet-close">Cancel</a>
              <a class="link sheet-close wallet-payment-done">Done</a>
            </div>
          </div>
          <div class="sheet-modal-inner">
            <div class="list no-hairlines no-margin">
              <ul>
                ${card ? `
                <li>
                  <label class="item-content item-radio">
                    <input type="radio" ${currentMethod === 'card' ? 'checked' : ''} name="payment-method" value="${card.id}">
                    <i class="icon icon-radio"></i>
                    ${card.icon_url ? `
                    <div class="item-media">
                      <img src="${card.icon_url}">
                    </div>
                    ` : ''}
                    <div class="item-inner">
                      <div class="item-title">${card.name}</div>
                    </div>
                  </label>
                </li>
                ` : ''}
                ${wechatInstalled ? `
                <li>
                  <label class="item-content item-radio">
                    <input type="radio" ${currentMethod === 'wechat' ? 'checked' : ''} name="payment-method" value="wechat">
                    <i class="icon icon-radio"></i>
                    <div class="item-media">
                      <i class="wallet-icon-wechat"></i>
                    </div>
                    <div class="item-inner">
                      <div class="item-title">${i18n.t('wallet.index.wechat_label')}</div>
                    </div>
                  </label>
                </li>
                ` : ''}
                ${window.cordova ? `
                <li>
                  <label class="item-content item-radio">
                    <input type="radio" ${currentMethod === 'alipay' ? 'checked' : ''} name="payment-method" value="alipay">
                    <i class="icon icon-radio"></i>
                    <div class="item-media">
                      <i class="wallet-icon-alipay"></i>
                    </div>
                    <div class="item-inner">
                      <div class="item-title">${i18n.t('wallet.index.alipay_label')}</div>
                    </div>
                  </label>
                </li>
                ` : ''}
              </ul>
            </div>
          </div>
        </div>
      `,
      on: {
        closed() {
          sheet.$el.off('click');
          sheet.destroy();
        },
      },
    }).open();
    sheet.$el.once('click', '.wallet-payment-done', () => {
      const selectedMethod = sheet.$el.find('input:checked').val();
      if (selectedMethod === 'alipay') callback(null, 'alipay');
      else if (selectedMethod === 'wechat') callback(null, 'wechat');
      else callback(cards[selectedMethod], 'card');
    });
  },
  showLoader() {
    if (transaction.cache.popup.$el.find('.transaction-preloader').length) return;
    transaction.cache.popup.$el.append('<div class="transaction-preloader"></div>');
  },
  hideLoader() {
    transaction.cache.popup.$el.find('.transaction-preloader').remove();
  },
  clear() {
    if (transaction.cache.popup.$el) transaction.cache.popup.$el.remove();
    if (transaction.cache.popup.destroy) transaction.cache.popup.destroy();
    transaction.cache = {};
  },
  renderError(error, data) {
    const { popup } = transaction.cache;
    const message = typeof error === 'string' ? error : (error && error.message || '');

    const html = renderPopupStatus({
      title: i18n.t('wallet.transaction_popup.error_title', 'Fail'),
      status: 'error',
      message,
      paymentMethod: data.paymentMethod,
    });
    transaction.cache.onReportBack = () => popup.$el.html(html);
    popup.$el.html(html);
  },
  renderSuccess(e, data) {
    const { popup } = transaction.cache;
    const { payee_name, card_name, amount, currency, paymentMethod } = data;

    const html = renderPopupStatus({
      title: i18n.t('wallet.transaction_popup.success_title', 'Success'),
      status: 'success',
      message: i18n.t('wallet.transaction_popup.success_message', {
        // defaultValue: `You sent ${currency}${amount}.<br>To ${payee_name}.<br>From ${card_name}.`,
        defaultValue: '',
        currency: currencyMap(currency),
        amount,
        to: payee_name,
        from: paymentMethod === 'card' ? card_name : i18n.t(`wallet.index.${paymentMethod}_label`),
      }),
      paymentMethod: data.paymentMethod,
    });
    transaction.cache.onReportBack = () => popup.$el.html(html);
    popup.$el.html(html);
  },
  aliPay(data) {
    const { payee_name, amount, order_id } = data;
    transaction.showLoader();
    const { f7 } = tommy.app;
    f7.request({
      method: 'POST',
      url: 'http://pay.ncxinjiang.com/test/alipay-app.php',
      data: {
        out_trade_no: order_id,
        total_amount: amount,
        subject: payee_name,
      },
      success(response) {
        window.cordova.plugins.alipay.payment(
          response,
          (e) => {
            transaction.hideLoader();
            transaction.renderSuccess(e, data);
            if (transaction.cache.onSuccess) transaction.cache.onSuccess(e, data);
          },
          (e) => {
            transaction.hideLoader();
            transaction.renderError(e, data);
            if (transaction.cache.onError) transaction.cache.onError(e, data);
          }
        );
      },
    });
  },
  wxPay(data) {
    const { payee_name, amount, order_id } = data;
    transaction.showLoader();
    const { f7 } = tommy.app;
    f7.request({
      method: 'POST',
      url: 'http://pay.ncxinjiang.com/test/wxpay-app.php',
      data: {
        out_trade_no: order_id,
        total_amount: amount,
        subject: payee_name,
      },
      dataType: 'json',
      success(response) {
        const sendParams = {
          partnerid: response.partnerid, // merchant id
          prepayid: response.prepayid, // prepay id
          noncestr: response.noncestr, // nonce
          timestamp: response.timestamp, // timestamp
          sign: response.sign, // signed string
        };
        window.Wechat.sendPaymentRequest(
          sendParams,
          (e) => {
            transaction.hideLoader();
            transaction.renderSuccess(e, data);
            if (transaction.cache.onSuccess) transaction.cache.onSuccess(e, data);
          },
          (e) => {
            transaction.hideLoader();
            transaction.renderError(e, data);
            if (transaction.cache.onError) transaction.cache.onError(e, data);
          }
        );
      },
    });
  },
  createTransaction(data) {
    const { card_name } = data;
    const { f7 } = tommy.app;
    if (data.paymentMethod === 'alipay') {
      transaction.aliPay(data);
      return;
    }
    if (data.paymentMethod === 'wechat') {
      transaction.wxPay(data);
      return;
    }
    transaction.showLoader();
    API.createWalletTransaction(data).then(
      (response) => {
        transaction.hideLoader();
        const transactionDetails = Object.assign({}, response || {}, { card_name });
        transaction.cache.transactionDetails = transactionDetails;

        if (transactionDetails.status && transactionDetails.status !== 'failed') {
          transaction.renderSuccess(transactionDetails, data);
          f7.$(document).trigger('wallet:transaction', transactionDetails);
          tommy.events.$emit('walletTransaction', transactionDetails);
          if (transaction.cache.onSuccess) transaction.cache.onSuccess(transactionDetails, data);
        } else if (transactionDetails.status === 'failed') {
          transaction.renderError(Object.assign(transactionDetails, {
            message: i18n.t('wallet.transaction_popup.error_insufficient', 'Sorry. Your Tommy account balance is insufficient. Please use other payment methods'),
          }), data);
          if (transaction.cache.onError) transaction.cache.onError(transactionDetails, data);
        }
      }, (error) => {
        const transactionDetails = Object.assign({}, data, { status: 'failed' });
        transaction.hideLoader();
        transaction.cache.transactionDetails = transactionDetails;
        transaction.renderError(error, data);
        if (transaction.cache.onError) transaction.cache.onError(error, data);
      }
    );
  },
  viewReport() {
    const { f7 } = tommy.app;
    const { popup, transactionDetails } = transaction.cache;
    const html = renderPopupReport(transactionDetails);
    popup.$el.html(html);
    f7.navbar.size(popup.$el);
  },
  render() {
    const { f7 } = tommy.app;
    const { popup, params } = transaction.cache;
    const { addon, addon_id, addon_install_id, payee_name, amount, currency, order_id } = params;

    transaction.showLoader();

    // get wallet cards
    API.getWalletCards().then((cards) => {
      let { id: wallet_card_id, wallet_account_id, name: card_name } = cards[0];
      let paymentMethod = 'card';
      const html = renderPopup({
        payee_name,
        currency: currencyMap(currency),
        amount,
        card_name,
      });

      transaction.hideLoader();
      popup.$el.append(html);

      popup.$el.on('click', '.transaction-popup-select-wallet', () => {
        transaction.selectWallet(paymentMethod, cards, (card, method) => {
          paymentMethod = method;
          if (method === 'card') {
            card_name = card.name;
            wallet_card_id = card.id;
            wallet_account_id = card.wallet_account_id;
          }
          popup.$el.find('.transaction-popup-select-wallet').text(method === 'card' ? card_name : i18n.t(`wallet.index.${method}_label`));
        });
      });
      popup.$el.once('click', '.transaction-popup-confirm-button', () => {
        transaction.createTransaction({
          paymentMethod,
          addon,
          addon_id,
          addon_install_id,
          payee_name,
          currency,
          amount,
          wallet_card_id,
          wallet_account_id,
          card_name,
          order_id,
        });
      });
      popup.$el.on('click', '.transaction-popup-report-button', () => {
        popup.$el.addClass('transaction-popup-status-rendered');
        transaction.viewReport();
      });
      popup.$el.on('click', '.transaction-popup-report-back', () => {
        if (transaction.cache.onReportBack) transaction.cache.onReportBack();
      });
    }).catch(() => {
      f7.popup.close('.wallet__transaction-popup');
    });
  },
  init(params = {}, onSuccess, onError) {
    const { f7 } = tommy.app;
    transaction.cache.params = params;
    transaction.cache.onSuccess = onSuccess;
    transaction.cache.onError = onError;

    const popup = f7.popup.create({
      content: `
        <div class="popup popup-tablet-fullscreen wallet__transaction-popup"></div>
      `,
      on: {
        opened() {
          transaction.render();
        },
        closed() {
          transaction.clear();
        },
      },
    });
    popup.open();
    transaction.cache.popup = popup;
  },
};
export default function (params, onSuccess, onError) {
  if (transaction.cache.popup) return;
  transaction.init(params, onSuccess, onError);
}
