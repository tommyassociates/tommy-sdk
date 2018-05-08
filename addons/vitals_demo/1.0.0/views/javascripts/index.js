import IndexController from './controllers/index'


//
// == Router

window.tommy.app.f7.onPageInit('vitals_demo__index', IndexController.init)
window.tommy.app.f7.onPageBack('vitals_demo__index', IndexController.uninit)
