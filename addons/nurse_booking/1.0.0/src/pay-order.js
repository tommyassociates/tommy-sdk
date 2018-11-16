import API from './api';


export default function (data, createNewOrder = true) {
  const tommy = window.tommy;
  const f7 = tommy.app.f7;
  const {
    teamId, productName, productId, total, discount = 0, location, date, couponId, orderId, nurse,
  } = data;

  tommy.initWalletTransaction(
    {
      addon: 'nurse_booking',
      payee_name: productName,
      currency: 'CNY',
      amount: total,
    },
    (transaction) => {
      const order = {
        vendor_product_id: productId,
        vendor_order_items: [productId],
        vendor_coupon_id: couponId || null,
        wallet_transaction_id: transaction.id,
        name: productName,
        status: 'paid',
        comment: '',
        data: {
          location,
          date,
          nurse,
        },
        discount,
        total,
      };


      const successUrl = '/nurse_booking/order-success/';
      if (createNewOrder) {
        API.sendOrder(teamId, order).then((response) => {
          API.createBookingEvent(teamId, { id: response.id, ...order }).then(() => {
            API.cache.booking.transaction = transaction;
            f7.views.main.router.navigate(`${successUrl}?id=${response.id}`);
          });
        });
      } else {
        API.createBookingEvent(teamId, { id: orderId, ...order }).then(() => {
          API.cache.booking.transaction = transaction;
          f7.views.main.router.navigate(`${successUrl}?id=${orderId}`);
        });
      }
    },
    (transaction) => {
      if (!transaction.id) return;
      const order = {
        vendor_product_id: productId,
        vendor_order_items: [productId],
        vendor_coupon_id: couponId || null,
        wallet_transaction_id: transaction.id,
        name: productName,
        status: 'pending',
        comment: '',
        data: {
          location,
          date,
          nurse,
        },
        discount,
        total,
      };

      const errorUrl = '/nurse_booking/order-error/';
      if (createNewOrder) {
        API.sendOrder(teamId, order).then((response) => {
          API.cache.booking.transaction = transaction;
          f7.views.main.router.navigate(`${errorUrl}?id=${response.id}`);
        });
      } else {
        API.cache.booking.transaction = transaction;
        f7.views.main.router.navigate(`${errorUrl}?id=${orderId}`);
      }
    }
  );
}
