import API from './api';


export default function (data, createNewOrder = true) {
  const tommy = window.tommy;
  const f7 = tommy.app.f7;
  const {
    teamId, productName, total, discount = 0, location, date, couponId, orderId, nurse, vendor_order_items_attributes, duration,
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
        vendor_order_items_attributes,
        vendor_coupon_id: couponId || null,
        wallet_transaction_id: transaction.id,
        name: productName,
        status: 'paid',
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


      const successUrl = '/nurse_booking/order-success/';
      if (createNewOrder) {
        API.sendOrder(teamId, order).then((responseOrder) => {
          API.createBookingEvent(teamId, { id: responseOrder.id, ...order }).then((event) => {
            API.cache.booking.transaction = transaction;
            f7.views.main.router.navigate(`${successUrl}?id=${responseOrder.id}`);
            responseOrder.event_id = event.id;
            API.updateOrder(teamId, responseOrder);
          });
          // API.setAvailabilityLock(order);
        });
      } else {
        API.updateOrder(teamId, { id: orderId, status: 'paid' }).then((responseOrder) => {
          API.createBookingEvent(teamId, { id: orderId, ...order }).then((event) => {
            API.cache.booking.transaction = transaction;
            f7.views.main.router.navigate(`${successUrl}?id=${orderId}`);
            responseOrder.event_id = event.id;
            API.updateOrder(teamId, responseOrder);
          });
          // API.setAvailabilityLock(order);
        });
      }
    },
    (transaction) => {
      if (!transaction.id) return;
      const order = {
        vendor_order_items_attributes,
        vendor_coupon_id: couponId || null,
        wallet_transaction_id: transaction.id,
        name: productName,
        status: 'pending',
        comment: '',
        assignee_id: nurse.user_id,
        assignee_team_id: teamId,
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
