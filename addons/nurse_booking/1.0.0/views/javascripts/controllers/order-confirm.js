import API from '../api';

const tommy = window.tommy;

const OrderConfirmController = {
  init (page) {
    OrderConfirmController.bind(page);
    OrderConfirmController.render();
  },
  bind (page) {
    OrderConfirmController.page = page;
    const $page = $$(page.container);

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
  uninit () {
    OrderConfirmController.page = null;
    delete OrderConfirmController.page;
  },
};

export default OrderConfirmController
