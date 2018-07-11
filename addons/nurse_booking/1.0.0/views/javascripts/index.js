import IndexController from './controllers/index'
import PackageListController from './controllers/package-list';
import currencyMap from './currency-map';

const { f7, t7 } = window.tommy.app;

// == Router
f7.onPageInit('nurse_booking__index', IndexController.init)
f7.onPageBeforeRemove('nurse_booking__index', IndexController.uninit)

f7.onPageInit('nurse_booking__package-list', PackageListController.init)
f7.onPageBeforeRemove('nurse_booking__package-list', PackageListController.uninit)

t7.registerHelper('nurse_booking__currencySymbol', code => {
  return currencyMap(code);
});

