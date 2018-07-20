import API from '../api';

const tommy = window.tommy;

const OrderDetailsController = {
  init (page) {
    OrderDetailsController.bind(page);
    OrderDetailsController.render();
  },
  bind (page) {
    OrderDetailsController.page = page;
  },
  render() {
    const { transaction, service, coupon, location, date } = API.cache.booking;
    tommy.tplManager.renderInline(
      'nurse_booking__orderDetailsTemplate',
      {
        service,
        coupon,
        total: service.price - (coupon ? coupon.amount : 0),
        location,
        date,
        transaction,
      },
    );
  },
  uninit () {
    OrderDetailsController.page = null;
    delete OrderDetailsController.page;
  },
};

export default OrderDetailsController
