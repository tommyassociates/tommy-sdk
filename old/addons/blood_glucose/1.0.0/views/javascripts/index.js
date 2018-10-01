import IndexController from './controllers/index'


//
// == Router

window.tommy.app.f7.onPageInit('blood_glucose__index', IndexController.init)
window.tommy.app.f7.onPageBack('blood_glucose__index', IndexController.uninit)
