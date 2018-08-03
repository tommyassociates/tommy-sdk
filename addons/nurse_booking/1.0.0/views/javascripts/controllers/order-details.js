import API from '../api';
import payOrder from '../pay-order';

const tommy = window.tommy;

const OrderDetailsController = {
  init (page) {
    OrderDetailsController.bind(page);
    OrderDetailsController.loadOrder();
  },
  bind (page) {
    OrderDetailsController.page = page;
    const $page = $$(page.container);
    $page.on('click', '.order-details-pay-button', () => {
      OrderDetailsController.payOrder();
    });
    $page.on('click', '.order-details-repeat-button', () => {
      OrderDetailsController.repeatOrder();
    });
    $page.on('click', '.order-details-cancel-button', () => {
      OrderDetailsController.cancelOrder();
    });
  },
  loadOrder() {
    const { page } = OrderDetailsController;
    if (!page.query.id) {
      const { transaction, service, coupon, location, date } = API.cache.booking;
      OrderDetailsController.render({
        service,
        coupon,
        total: service.price - (coupon ? coupon.amount : 0),
        location,
        date,
        transaction,
      });
    } else {
      API.getOrderDetails(page.query.id).then((order) => {
        OrderDetailsController.order = order;
        const canceled = order.canceled;
        const data = {
          id: order.id,
          status: {
            pending: !canceled && order.status === 'pending',
            canceled,
            progress: !canceled && (order.status === 'paid' || order.status === 'processing'),
            complete: !canceled && order.status === 'complete',
          },
          date: parseInt(order.data.date, 10),
          service: {
            name: order.name,
            id: order.vendor_product_id,
          },
          total: order.total,
          transaction: {
            card_name: order.wallet_transaction.card_name,
          }
        }
        if (order.vendor_coupon_id) {
          data.coupon = {
            id: order.vendor_coupon_id,
            amount: order.discount,
          }
        }
        OrderDetailsController.render(data)
      });
    }
  },
  render(data) {
    tommy.tplManager.renderInline(
      'nurse_booking__orderDetailsTemplate',
      data,
    );
  },
  repeatOrder() {
    const order = OrderDetailsController.order;
    if (!order) return;

    API.cache.booking.date = parseInt(order.data.date, 10);
    API.cache.booking.location = order.data.location;
    delete API.cache.booking.coupon;

    API.getServiceDetails(order.vendor_product_id).then((service) => {
      API.cache.booking.service = service;

      const confirmUrl = tommy.util.addonAssetUrl(
        Template7.global.currentAddonInstall.package,
        Template7.global.currentAddonInstall.version,
        'views/order-confirm.html',
        true
      );
      tommy.f7.views.main.loadPage({ url: confirmUrl });
    });
  },
  payOrder() {
    // pay as usual
    const order = OrderDetailsController.order;
    payOrder({
      orderId: order.id,
      productName: order.name,
      productId: order.vendor_product_id,
      total: order.total,
      couponId: order.vendor_coupon_id,
      discount: order.discount,
      location: order.data.location,
      date: order.data.date,
    }, false);
  },
  cancelOrder() {
    // cancel and move to cancel status page
    const order = OrderDetailsController.order;
    if (!order) return;
    if (OrderDetailsController.preventCancel) return;
    OrderDetailsController.preventCancel = true;
    tommy.f7.confirm(
      `
      <div class="order-details-cancel-order-icon"></div>
      <div>${tommy.i18n.t('order_details.cancel_confirm')}</div>
      `,
      () => {
        API.cancelOrder(order.id)
          .then(() => {
            OrderDetailsController.preventCancel = false;
            const canceledUrl = tommy.util.addonAssetUrl(
              Template7.global.currentAddonInstall.package,
              Template7.global.currentAddonInstall.version,
              'views/order-canceled.html',
              true
            );
            tommy.f7.views.main.loadPage({ url: canceledUrl });
          })
          .catch(() => {
            OrderDetailsController.preventCancel = false;
          })
      },
      () => {
        OrderDetailsController.preventCancel = false;
      }
    );
  },
  uninit () {
    OrderDetailsController.page = null;
    delete OrderDetailsController.page;
  },
};

export default OrderDetailsController
