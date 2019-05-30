import API from './api';


export default function (data, createNewOrder = true) {
  const tommy = window.tommy;
  const f7 = tommy.app.f7;
  const {
    teamId, productName, total, discount = 0, location, date, couponId, orderId, nurse, vendor_order_items_attributes, duration,
  } = data;

  const successUrl = '/nurse_booking/order-success/';
  const errorUrl = '/nurse_booking/order-error/';

  const order = {
    vendor_order_items_attributes,
    vendor_coupon_id: couponId || null,
    name: productName,
    status: 'pending',
    comment: '',
    assignee_id: nurse.user_id,
    assignee_team_id: teamId,
    data: {
      location,
      date,
      nurse,
      duration,
    },
    discount,
    total,
  };

  function pay(responseOrder) {
    tommy.initWalletTransaction(
      {
        addon: 'nurse_booking',
        payee_name: productName,
        currency: 'CNY',
        amount: total,
        order_id: responseOrder.id,
      },
      (transaction, walletData = {}) => {
        API.createBookingEvent(teamId, { id: responseOrder.id, ...order }).then((event) => {
          API.cache.booking.transaction = transaction;
          f7.views.main.router.navigate(`${successUrl}?id=${responseOrder.id}`);
          responseOrder.event_id = event.id;
          responseOrder.status = 'paid';
          responseOrder.wallet_transaction_id = transaction.id;
          responseOrder.payment_method = walletData.paymentMethod || 'card';
          API.updateOrder(teamId, responseOrder);
        });
      },
      (transaction, walletData = {}) => {
        API.cache.booking.transaction = transaction;
        f7.views.main.router.navigate(`${errorUrl}?id=${responseOrder.id}`);
        responseOrder.wallet_transaction_id = transaction.id;
        responseOrder.payment_method = walletData.paymentMethod || 'card';
        API.updateOrder(teamId, responseOrder);
      }
    );
  }

  if (createNewOrder) {
    API.sendOrder(teamId, order).then(pay);
  } else {
    pay({ id: orderId, ...order });
  }
}
