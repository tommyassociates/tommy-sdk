import Index from "./pages/index.vue";
import Settings from "./pages/settings.vue";
import Detail from "./pages/detail.vue";
import Search from "./pages/search.vue";
import TakePhoto from "./pages/take-photo.vue";

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
    path: "/time-clock/detail/",
    component: Detail,		
  },
  {
    path: "/time-clock/search/",
    component: Search,		
  },
  {
    path: "/time-clock/take-photo/",
    component: TakePhoto,		
  } 
];

export default routes;
