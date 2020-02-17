import IndexController from './controllers/index'

const { f7, t7 } = window.tommy.app;

// == Router
f7.onPageInit('training__index', IndexController.init)
f7.onPageBeforeRemove('training__index', IndexController.uninit)



