import IndexController from './controllers/index'


//
// == Router

window.tommy.app.f7.onPageInit('meditation_reminder__index', IndexController.init)
window.tommy.app.f7.onPageBack('meditation_reminder__index', IndexController.uninit)
