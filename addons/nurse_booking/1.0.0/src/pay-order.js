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

  let orderDate = order.data.date;
  if (typeof orderDate === 'string') orderDate = parseInt(orderDate, 10);
  let end_at;
  if (order.data.duration && order.data.duration > 0)  {
    end_at = orderDate + parseInt(order.data.duration, 10) * 60 * 1000;
  } else {
    end_at = orderDate + 60 * 60 * 1000;
  }
  order.event_attributes = {
    addon: 'nurse_booking',
    title: order.name,
    start_at: new Date(orderDate).toJSON(),
    end_at: new Date(end_at).toJSON(),
    location: `${order.data.location.city} ${order.data.location.address}`,
    user_id: order.user_id,
    team_id: null,
    assignee_id: order.data.nurse.user_id,
    assignee_team_id: teamId,
    kind: 'Booking',
    resource_id: order.id,
    resource_type: 'VendorOrder',
  };

  function pay(responseOrder) {
    if (total === 0) {
      API.cache.booking.transaction = {};
      responseOrder.status = 'paid';
      API.updateOrder(teamId, responseOrder).then(() => {
        f7.views.main.router.navigate(`${successUrl}?id=${responseOrder.id}`);
      });
      return;
    }
    tommy.initWalletTransaction(
      {
        addon: 'nurse_booking',
        payee_name: productName,
        currency: 'CNY',
        amount: total,
        order_id: responseOrder.id,
      },
      (transaction, walletData = {}) => {
        API.cache.booking.transaction = transaction;
        responseOrder.status = 'paid';
        responseOrder.wallet_transaction_id = transaction.id;
        responseOrder.payment_method = walletData.paymentMethod || 'card';
        responseOrder.data.payment_method = walletData.paymentMethod || 'card';
        API.updateOrder(teamId, responseOrder).then(() => {
          f7.views.main.router.navigate(`${successUrl}?id=${responseOrder.id}`);
        });
      },
      (transaction, walletData = {}) => {
        f7.views.main.router.navigate(`${errorUrl}?id=${responseOrder.id}`);
        API.cancelOrder(teamId, responseOrder.id);
      }
    );
  }

  if (createNewOrder) {
    API.sendOrder(teamId, order).then(pay);
  } else {
    pay({ id: orderId, ...order });
  }
}
