import Index from './pages/index.vue';
import Details from './pages/details.vue';

const routes = [
  {
    path: '/bookings/',
    component: Index,
  },
  {
    path: '/bookings/details/',
    component: Details,
  },
];
export default routes;
