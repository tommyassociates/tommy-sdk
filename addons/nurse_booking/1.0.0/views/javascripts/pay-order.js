import API from './api';

const tommy = window.tommy;

export default function (data, createNewOrder = true, query = '') {
  const { productName, productId, total, discount = 0, location, date, couponId } = data;
  const f7 = tommy.app.f7;

  tommy.initWalletTransaction({
    addon: 'nurse_booking',
    payee_name: productName,
    currency: 'CNY',
    amount: total,
  }, (transaction) => {
    const order = {
      vendor_product_id: productId,
      vendor_coupon_id: couponId || null,
      wallet_transaction_id: transaction.id,
      name: productName,
      status: 'paid',
      comment: '',
      data: {
        location,
        date,
      },
      discount,
      total,
    };

    const successUrl = tommy.util.addonAssetUrl(
      Template7.global.currentAddonInstall.package,
      Template7.global.currentAddonInstall.version,
      'views/order-success.html',
      true
    );
    if (createNewOrder) {
      API.sendOrder(order).then((response) => {
        API.cache.booking.transaction = transaction;
        f7.views.main.loadPage({ url: successUrl + '&id=' + response.id + query });
      });
    } else {
      API.cache.booking.transaction = transaction;
      f7.views.main.loadPage({ url: successUrl + '&id=' + response.id + query });
    }
  }, (transaction) => {
    if (!transaction.id) return;
    const order = {
      vendor_product_id: productId,
      vendor_coupon_id: couponId || null,
      wallet_transaction_id: transaction.id,
      name: productName,
      status: 'pending',
      comment: '',
      data: {
        location,
        date,
      },
      discount,
      total,
    };

    const errorUrl = tommy.util.addonAssetUrl(
      Template7.global.currentAddonInstall.package,
      Template7.global.currentAddonInstall.version,
      'views/order-error.html',
      true
    );
    if (createNewOrder) {
      API.sendOrder(order).then((response) => {
        API.cache.booking.transaction = transaction;
        f7.views.main.loadPage({ url: errorUrl + '&id=' + response.id + query });
      });
    } else {
      API.cache.booking.transaction = transaction;
      f7.views.main.loadPage({ url: errorUrl + '&id=' + response.id + query });
    }
  });
}