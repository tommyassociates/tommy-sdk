import IndexController from './controllers/index'


//
// == Router

window.tommy.app.f7.onPageInit('pedometer__index', IndexController.init)
window.tommy.app.f7.onPageBack('pedometer__index', IndexController.uninit)
