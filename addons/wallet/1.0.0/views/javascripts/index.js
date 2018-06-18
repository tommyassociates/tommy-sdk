import IndexController from './controllers/index'


//
// == Router

window.tommy.app.f7.onPageInit('wallet__index', IndexController.init)
window.tommy.app.f7.onPageBack('wallet__index', IndexController.uninit)
