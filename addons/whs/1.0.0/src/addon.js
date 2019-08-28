import Index from './pages/index.vue';
import ItemDetails from './pages/item-details.vue';

const routes = [
  {
    path: '/whs/',
    component: Index,
  },
  {
    path: '/whs/item/',
    component: ItemDetails,
  },
];

export default routes;
