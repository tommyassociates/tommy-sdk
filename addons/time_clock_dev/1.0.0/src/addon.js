import addonConfig from "./addonConfig";
import Index from "./pages/index.vue";
import Detail from "./pages/detail.vue";
import Search from "./pages/search.vue";
import SelectPicker from "./pages/select-picker.vue";
// import MapPage from "./pages/map.vue";
import TakePhoto from './pages/locked/take-photo';



// console.log('TIME_CLOCK addon');

const routes = [
  {
    path: `${addonConfig.baseUrl}`,
    component: Index,
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
    path: `${addonConfig.baseUrl}locked/take-photo/`,
    component: TakePhoto,
  },


];

export default routes;
