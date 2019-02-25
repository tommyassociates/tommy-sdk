import Index from './pages/index.vue';
import Add from './pages/add.vue';
import Settings from './pages/settings.vue';
import History from './pages/history.vue';

const routes = [
  {
    path: '/weight/',
    component: Index,
  },
  {
    path: '/weight/add/',
    component: Add,
  },
  {
    path: '/weight/settings/',
    component: Settings,
  },
  {
    path: '/weight/history/',
    component: History,
  },
];
export default routes;
