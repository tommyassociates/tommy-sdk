import Index from "./pages/index.vue";
import Settings from "./pages/settings.vue";
import Detail from "./pages/detail.vue";
import Search from "./pages/search.vue";
import SelectPicker from "./pages/select-picker.vue";
import MapPage from "./pages/map.vue";

const routes = [
  {
    path: "/time-sheets/",
    component: Index,
  },
  {
    path: "/time-sheets/settings/",
    component: Settings,
  },
  {
    path: "/time-sheets/detail/:id",
    component: Detail,
  },
  {
    path: "/time-sheets/search/",
    component: Search,
  },
  {
    path: "/time-sheets/select-picker/",
    component: SelectPicker,
  },
  {
    path: "/time-sheets/map/",
    component: MapPage,
  },
];

export default routes;
