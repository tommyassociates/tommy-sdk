import API from '../api';

const tommy = window.tommy;

const ServiceDetailsController = {
  init (page) {
    ServiceDetailsController.bind(page);
  },
  bind (page) {
    ServiceDetailsController.page = page;

    const $page = $$(page.container);
    const f7 = tommy.app.f7;
    const id = page.query.id;

    let service = {};
    (API.cache.services || []).forEach((serviceData) => {
      if (serviceData.id === parseInt(id, 10)) {
        service = serviceData;
        service.coupons = API.cache.coupons.filter(coupon => coupon.vendor_product_id === service.id);
      }
    });

    // Navbar Title
    $$(page.navbarInnerContainer)
      .find('.center')
      .text(service.name);

    f7.sizeNavbars();

    // Template
    tommy.tplManager.renderTarget(
      'nurse_booking__serviceDetailsTemplate',
      { service },
      page.container
    );

    // Swiper
    f7.swiper($page.find('.swiper-container'), {
      pagination: '.swiper-pagination'
    });

    $$(page.container).on('click', '.service-book-button', () => {
      API.cache.booking.service = service;
    });
  },
  uninit () {
    ServiceDetailsController.page = null;
    delete ServiceDetailsController.page;
  },
};

export default ServiceDetailsController
