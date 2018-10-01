import API from '../api';
import couponPicker from '../coupon-picker';

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
    let selectedCoupon;
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

    // Next Url
    const locationUrl = tommy.util.addonAssetUrl(
      Template7.global.currentAddonInstall.package,
      Template7.global.currentAddonInstall.version,
      'views/location.html',
      true
    );

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

    $$(page.container).on('click', '.service-details-coupons-link', () => {
      couponPicker(service.coupons, (coupon) => {
        selectedCoupon = coupon;
        API.cache.booking.service = service;
        API.cache.booking.coupon = selectedCoupon;
        f7.views.main.loadPage({ url: locationUrl });
      }, () => {
        selectedCoupon = undefined;
      })
    });

    $$(page.container).on('click', '.service-book-button', () => {
      API.cache.booking.service = service;

      if (service.coupons && service.coupons.length) {
        couponPicker(service.coupons, (coupon) => {
          selectedCoupon = coupon;
          API.cache.booking.service = service;
          API.cache.booking.coupon = selectedCoupon;
          f7.views.main.loadPage({ url: locationUrl });
        }, () => {
          API.cache.booking.coupon = null;
          delete API.cache.booking.coupon;
          selectedCoupon = undefined;
          f7.views.main.loadPage({ url: locationUrl });
        })
      } else {
        API.cache.booking.coupon = null;
        delete API.cache.booking.coupon;
        selectedCoupon = undefined;
        f7.views.main.loadPage({ url: locationUrl });
      }
    });
  },
  uninit () {
    ServiceDetailsController.page = null;
    delete ServiceDetailsController.page;
  },
};

export default ServiceDetailsController
