import API from '../api'

const IndexController = {
  init (page) {
    console.log('initialize nurse booking addon')
    IndexController.bind(page);
    const $page = $$(page.container);
    const f7 = window.tommy.app.f7;
    f7.swiper($page.find('.swiper-container'), {
      pagination: '.swiper-pagination'
    });

  },
  bind (page) {
    IndexController.page = page;
  },
  uninit () {
    IndexController.page = null;
    delete IndexController.page;
    console.log('uninitialize wallet addon')
  },
};

export default IndexController
