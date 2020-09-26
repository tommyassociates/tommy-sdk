import Index from './pages/index.vue';
import Payments from './pages/payments.vue';

const routes = [
  {
    path: '/subscriptions/',
    component: Index,
  },
  {
    path: '/subscriptions/payments',
    component: Payments,
  },
];
export default routes;
