import API from '../api'

const PackageListController = {
  init (page) {
    PackageListController.bind(page);
    const $page = $$(page.container);
    const f7 = window.tommy.app.f7;
    console.log('init package list'.toUpperCase())
    f7.swiper($page.find('.swiper-container'), {
      centeredSlides: true,
      slidesPerView: 'auto',
    });

  },
  bind (page) {
    PackageListController.page = page;
  },
  uninit () {
    PackageListController.page = null;
    delete PackageListController.page;
  },
};

export default PackageListController
