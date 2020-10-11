import addonConfig from "./addonConfig";
import index from "./pages/index.vue";
import detail from "./pages/detail.vue";
import search from "./pages/search.vue";
import selectPicker from "./pages/select-picker.vue";
// import MapPage from "./pages/map.vue";
// import takePhoto from './pages/locked/take-photo';
import confirmation from './pages/confirmation';
import settings from './pages/settings';



// console.log('TIME_CLOCK addon');

const routes = [
  {
    path: `${addonConfig.baseUrl}`,
    component: index,
  },
  {
    path: `${addonConfig.baseUrl}detail/:id`,
    component: detail,
  },
  {
    path: `${addonConfig.baseUrl}search/`,
    component: search,
  },
  {
    path: `${addonConfig.baseUrl}select-picker/`,
    component: selectPicker,
  },
  // {
  //   path: `${addonConfig.baseUrl}map/`,
  //   component: MapPage,
  // },
  // {
  //   path: `${addonConfig.baseUrl}locked/take-photo/`,
  //   component: takePhoto,
  // },
  {
    path: `${addonConfig.baseUrl}confirmation/`,
    component: confirmation,
  },
  {
    path: `${addonConfig.baseUrl}settings/`,
    component: settings,
  },


];

export default routes;



