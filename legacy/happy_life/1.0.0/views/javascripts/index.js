import IndexController from './controllers/index'


//
// == Router

window.tommy.app.f7.onPageInit('happy_life__index', IndexController.init)
window.tommy.app.f7.onPageBack('happy_life__index', IndexController.uninit)
