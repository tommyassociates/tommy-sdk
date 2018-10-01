import API from '../api';

const tommy = window.tommy;

const ServiceListController = {
  init (page) {
    ServiceListController.bind(page);
    ServiceListController.loadServices();
  },
  bind (page) {
    ServiceListController.page = page;
  },
  loadServices() {
    const page = ServiceListController.page;
    const $page = $$(page.container);
    const f7 = tommy.app.f7;
    const category = page.query.category;

    // Navbar Title
    $$(page.navbarInnerContainer)
      .find('.center')
      .text(tommy.i18n.t(`service_list.${category.toLowerCase()}_title`));

    f7.sizeNavbars();

    // Request services and coupons
    Promise.all([API.getServiceList(), API.getCouponList()]).then(([servicesData, couponsData]) => {
      const services = servicesData.filter(el => el.category === category);

      services.forEach((service) => {
        service.coupons = couponsData.filter(coupon => coupon.vendor_product_id === service.id);
      });

      // Template
      tommy.tplManager.renderInline(
        'nurse_booking__serviceListTemplate',
        { services },
      );

      // Swiper
      f7.swiper($page.find('.swiper-container'), {
        centeredSlides: true,
        slidesPerView: 'auto',
      });
    });
  },
  uninit () {
    ServiceListController.page = null;
    delete ServiceListController.page;
  },
};

export default ServiceListController
