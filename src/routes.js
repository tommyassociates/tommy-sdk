// import Home from './pages/home.vue';     // <== Can be removed pending PR review
import coreRoutes from 'tommy-core/src/routes';
import Settings from './pages/settings.vue';
import AddonDetails from './pages/addon-details.vue';
import Addons from './pages/addons.vue';

import Views from './pages/views.vue';
import config from '../config.json';

let StartPage = undefined;
if (config.starting_page) {
  StartPage = () => import('./pages/' + config.starting_page + '.vue');
} else {
  StartPage = () => import('./pages/home.vue');
}

const routes = [
  {
    path: '/',
    component: StartPage,
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
    path: '/Views/',
    component: Views,
    name: 'views',
  },
  {
    path: '/addon-details/:package/',
    component: AddonDetails,
  },
  ...coreRoutes,
];

export default routes;
