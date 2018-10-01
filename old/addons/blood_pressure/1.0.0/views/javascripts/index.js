import IndexController from './controllers/index'


//
// == Router

window.tommy.app.f7.onPageInit('blood_pressure__index', IndexController.init)
window.tommy.app.f7.onPageBack('blood_pressure__index', IndexController.uninit)
