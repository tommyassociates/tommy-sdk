import API from '../api';
import couponPicker from '../coupon-picker';
import payOrder from '../pay-order';

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
      setTimeout(() => {
        OrderConfirmController.render();
      }, 0);
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
    const total = service.price - (coupon ? coupon.amount : 0);

    payOrder({
      productName: service.name,
      productId: service.id,
      total,
      couponId: coupon ? coupon.id : null,
      discount: coupon ? coupon.amount : 0,
      location,
      date,
    });
  },
  uninit () {
    OrderConfirmController.page = null;
    delete OrderConfirmController.page;
  },
};

export default OrderConfirmController
