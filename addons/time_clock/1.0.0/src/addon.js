import Index from "./pages/index.vue";
import Settings from "./pages/settings.vue";
import Detail from "./pages/detail.vue";
import Search from "./pages/search.vue";
import SelectPicker from "./pages/select-picker.vue";

const routes = [
  {
    path: "/time-clock/",
    component: Index,		
  },
  {
    path: "/time-clock/settings/",
    component: Settings,		
  },
  {
    path: "/time-clock/detail/:id",
    component: Detail,		
  },
  {
    path: "/time-clock/search/",
    component: Search,		
  },
  {
    path: "/time-clock/select-picker/",
    component: SelectPicker,		
  }
];

export default routes;
