import Home from './pages/home.vue';
import Settings from './pages/settings.vue';
import AddonDetails from './pages/addon-details.vue';
import Addons from './pages/addons.vue';

import Views from './pages/views.vue';

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
    path: '/addons/',
    component: Addons,
    name: 'addons',
  },
  {
    path: '/views/',
    component: Views,
    name: 'views',
  },
  {
    path: '/addon-details/:pkg/',
    component: AddonDetails,
  },
];

export default routes;
