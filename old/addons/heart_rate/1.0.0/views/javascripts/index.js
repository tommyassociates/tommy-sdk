import IndexController from './controllers/index'


//
// == Router

window.tommy.app.f7.onPageInit('heart_rate__index', IndexController.init)
window.tommy.app.f7.onPageBack('heart_rate__index', IndexController.uninit)
