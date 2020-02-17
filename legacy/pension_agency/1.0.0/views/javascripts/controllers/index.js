const IndexController = {
  init (page) {
    console.log('initialize pension agency addon')
    IndexController.bind(page);
  },
  bind (page) {
    IndexController.page = page;
  },
  uninit () {
    IndexController.page = null;
    delete IndexController.page;
    console.log('uninitialize pension agency addon')
  },
};

export default IndexController
