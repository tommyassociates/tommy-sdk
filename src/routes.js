import Home from './pages/home.vue';
import Settings from './pages/settings.vue';
import AddonDetails from './pages/addon-details.vue';

// FIXME

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
];

export default routes;
