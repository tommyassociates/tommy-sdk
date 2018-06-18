import IndexController from './controllers/index'


//
// == Router

window.tommy.app.f7.onPageInit('temperature__index', IndexController.init)
window.tommy.app.f7.onPageBack('temperature__index', IndexController.uninit)
