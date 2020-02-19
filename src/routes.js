import Home from './pages/home.vue';
import Settings from './pages/settings.vue';
import AddonDetails from './pages/addon-details.vue';

import coreRoutes from 'tommy-core/src/routes';

const routes = [
  {
    path: '/',
    component: Home,
  },
  {
    path: '/settings/',
    component: Settings,
  },
  {
    path: '/addon-details/:package/',
    component: AddonDetails,
  },
  ...coreRoutes
];

export default routes;
