import API from '../api';
import couponPicker from '../coupon-picker';

const tommy = window.tommy;

const OrderConfirmController = {
  init (page) {
    OrderConfirmController.bind(page);
    OrderConfirmController.render();
  },
  bind (page) {
    OrderConfirmController.page = page;
    const $page = $$(page.container);
    const f7 = tommy.app.f7;

    const { service } = API.cache.booking;

    const locationUrl = tommy.util.addonAssetUrl(
      Template7.global.currentAddonInstall.package,
      Template7.global.currentAddonInstall.version,
      'views/location.html',
      true
    );
    $page.on('click', 'a.order-confirm-select-location', () => {
      f7.views.main.loadPage({ url: `${locationUrl}&back=true` })
    });

    $page.on('click', 'a.order-confirm-select-coupon', () => {
      couponPicker(service.coupons, (coupon) => {
        API.cache.booking.coupon = coupon;
        OrderConfirmController.render();
      }, () => {}, API.cache.booking.coupon)
    });

    $page.on('click', 'a.order-confirm-pay-button', () => {
      OrderConfirmController.pay();
    });
  },
  onBeforeIn(page) {
    if (page.from === 'left') {
      OrderConfirmController.render();
    }
  },
  render() {
    const { service, coupon, location, date} = API.cache.booking;
    tommy.tplManager.renderInline(
      'nurse_booking__orderConfirmTemplate',
      {
        user: window.tommy.config.getCurrentUser(),
        service,
        coupon,
        total: service.price - (coupon ? coupon.amount : 0),
        location,
        date,
      },
    );
  },
  pay() {
    const { service, coupon, location, date} = API.cache.booking;
    const f7 = tommy.app.f7;
    const total = service.price - (coupon ? coupon.amount : 0);

    tommy.initWalletTransaction({
      addon_id: 33,
      addon_install_id: 8640,
      payee_name: service.name,
      currency: 'CNY',
      amount: total,
    }, (transaction) => {

      const order = {
        vendor_product_id: service.id,
        vendor_coupon_id: coupon ? coupon.id : null,
        wallet_transaction_id: transaction.id,
        name: service.name,
        comment: '',
        data: {
          location,
          date,
        },
        discount: coupon ? coupon.amount : 0,
        total,
      };
      API.sendOrder(order);

      API.cache.booking.transaction = transaction;

      const successUrl = tommy.util.addonAssetUrl(
        Template7.global.currentAddonInstall.package,
        Template7.global.currentAddonInstall.version,
        'views/order-success.html',
        true
      );
      f7.views.main.loadPage({ url: successUrl });
    });
  },
  uninit () {
    OrderConfirmController.page = null;
    delete OrderConfirmController.page;
  },
};

export default OrderConfirmController
