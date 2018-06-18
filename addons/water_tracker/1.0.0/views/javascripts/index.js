import IndexController from './controllers/index'


//
// == Router

window.tommy.app.f7.onPageInit('water_tracker__index', IndexController.init)
window.tommy.app.f7.onPageBack('water_tracker__index', IndexController.uninit)
