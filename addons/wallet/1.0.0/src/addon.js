import Index from './pages/index.vue';
import Settings from './pages/settings.vue';
import TransactionDetails from './pages/transaction-details.vue';
import CardDetails from './pages/card-details.vue';

const routes = [
  {
    path: '/wallet/',
    component: Index,
  },
  {
    path: '/wallet/settings/',
    component: Settings,
  },
  {
    path: '/wallet/transaction/:id/',
    component: TransactionDetails,
  },
  {
    path: '/wallet/card/:id/',
    component: CardDetails,
  },
];

export default routes;
