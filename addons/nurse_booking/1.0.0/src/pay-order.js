import API from './api';

let paying = false;
export default function (data, createNewOrder = true) {
  console.log('pay order', data, createNewOrder, paying)
  if (paying) return;
  paying = true;
  let succeed;
  let errored;
  const tommy = window.tommy;
  const moment = tommy.moment;
  const f7 = tommy.app.f7;
  const {
    teamId, productName, total, discount = 0, location, date, couponIds, orderId, nurse, vendor_order_items_attributes, duration,
  } = data;

  const successUrl = '/nurse_booking/order-success/';
  const errorUrl = '/nurse_booking/order-error/';

  const order = {
    vendor_order_items_attributes,
    vendor_coupon_ids: couponIds,
    name: productName,
    status: 'pending',
    // comment: '',
    team_id: teamId,
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

  let startDate = order.data.date;
  if (typeof startDate === 'string') startDate = parseInt(startDate, 10);
  let endDate;
  if (order.data.duration && order.data.duration > 0) {
    endDate = startDate + parseInt(order.data.duration, 10) * 60 * 1000;
  } else {
    endDate = startDate + 60 * 60 * 1000;
  }

  const startTime = moment(startDate).format('YYYY-MM-DDTHH:mm:ss')
  const endTime = moment(endDate).format('YYYY-MM-DDTHH:mm:ss')

  order.workforce_shift_attributes = {
    event_attributes: {
      title: order.name,
      location_name: order.data.location.city,
      address: order.data.location.address,
      details: productName,
      start_at: startTime, // new Date(startDate).toJSON(),
      end_at: endTime // new Date(endDate).toJSON()
    }
  }

  // order.event_attributes = {
  //   // addon: 'nurse_booking',
  //   title: order.name,
  //   start_at: new Date(startDate).toJSON(),
  //   endDate: new Date(endDate).toJSON(),
  //   location_name: `${order.data.location.city} ${order.data.location.address}`,
  //   user_id: order.user_id,
  //   team_id: null,
  //   assignee_id: order.data.nurse.user_id,
  //   assignee_team_id: teamId,
  //   kind: 'Booking',
  //   resource_id: order.id,
  //   resource_type: 'VendorOrder',
  // };

  function pay(responseOrder) {
    if (total === 0) {
      API.cache.booking.transaction = {};
      responseOrder.status = 'paid';
      API.updateOrder(teamId, responseOrder).then(() => {
        paying = false;
        f7.views.main.router.navigate(`${successUrl}?id=${responseOrder.id}`);
      }).catch(() => {
        paying = false;
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
        console.log('transaction onSuccess')
        paying = false;
        succeed = true;
        if (errored) return;
        API.cache.booking.transaction = transaction;
        responseOrder.status = 'paid';
        responseOrder.wallet_transaction_id = transaction.id;
        responseOrder.payment_method = walletData.paymentMethod || 'card';
        responseOrder.data.payment_method = walletData.paymentMethod || 'card';
        API.updateOrder(teamId, responseOrder).then(() => {
          f7.views.main.router.navigate(`${successUrl}?id=${responseOrder.id}`);
        }).catch(() => {
          paying = false;
        });
      },
      (transaction, walletData = {}) => {
        console.log('transaction onError')
        paying = false;
        errored = true;
        if (succeed) return;
        API.cancelOrder(teamId, responseOrder.id).then(() => {
          f7.views.main.router.navigate(`${errorUrl}?id=${responseOrder.id}`);
        }).catch(() => {
          f7.views.main.router.navigate(`${errorUrl}?id=${responseOrder.id}`);
        });
      },
      () => {
        console.log('transaction onClose')
        paying = false;
      }
    );
  }

  if (createNewOrder) {
    API.sendOrder(teamId, order).then(pay).catch(_ => paying = false);
  } else {
    pay({ id: orderId, ...order });
  }
}
