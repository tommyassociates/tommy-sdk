const IndexController = {
  init (page) {
    console.log('initialize training addon')
    IndexController.bind(page);
  },
  bind (page) {
    IndexController.page = page;
  },
  uninit () {
    IndexController.page = null;
    delete IndexController.page;
    console.log('uninitialize training addon')
  },
};

export default IndexController
