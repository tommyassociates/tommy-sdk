import API from '../api'

const PackageDetailsController = {
  init (page) {
    PackageDetailsController.bind(page);

    const $page = $$(page.container);
    const f7 = window.tommy.app.f7;
    f7.swiper($page.find('.swiper-container'), {
      pagination: '.swiper-pagination'
    });
  },
  bind (page) {
    PackageDetailsController.page = page;
  },
  uninit () {
    PackageDetailsController.page = null;
    delete PackageDetailsController.page;
  },
};

export default PackageDetailsController
