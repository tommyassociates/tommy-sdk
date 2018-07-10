import IndexController from './controllers/index'
import currencyMap from './currency-map';

const { f7, t7 } = window.tommy.app;

// == Router
f7.onPageInit('nurse_booking__index', IndexController.init)
f7.onPageBeforeRemove('nurse_booking__index', IndexController.uninit)

t7.registerHelper('wallet__currencySymbol', code => {
  return currencyMap(code);
});

