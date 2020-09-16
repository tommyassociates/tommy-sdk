import addonConfig from "./addonConfig";
import Index from "./pages/index.vue";
import Settings from "./pages/settings.vue";
import Detail from "./pages/detail.vue";
import Search from "./pages/search.vue";
import SelectPicker from "./pages/select-picker.vue";
// import MapPage from "./pages/map.vue";
import TakePhoto from './pages/take-photo';

import LockedEnterPin from './pages/locked/enter-pin';

console.log('TIME_CLOCK addon');

const routes = [
  {
    path: `${addonConfig.baseUrl}`,
    component: Index,
  },
  {
    path: `${addonConfig.baseUrl}settings/`,
    component: Settings,
  },
  {
    path: `${addonConfig.baseUrl}detail/:id`,
    component: Detail,
  },
  {
    path: `${addonConfig.baseUrl}search/`,
    component: Search,
  },
  {
    path: `${addonConfig.baseUrl}select-picker/`,
    component: SelectPicker,
  },
  // {
  //   path: `${addonConfig.baseUrl}map/`,
  //   component: MapPage,
  // },
  {
    path: `${addonConfig.baseUrl}take-photo/`,
    component: TakePhoto,
  },

  {
    path: `${addonConfig.baseUrl}locked/enter-pin/`,
    component: LockedEnterPin,
  },
];

export default routes;
