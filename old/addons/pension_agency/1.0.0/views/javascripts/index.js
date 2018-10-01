import IndexController from './controllers/index'

const { f7, t7 } = window.tommy.app;

// == Router
f7.onPageInit('pension_agency__index', IndexController.init)
f7.onPageBeforeRemove('pension_agency__index', IndexController.uninit)



