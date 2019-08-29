import Index from './pages/index.vue';
import ItemDetails from './pages/item-details.vue';
import ItemAdd from './pages/item-add.vue';
import TagAdd from './pages/tag-add.vue';
import LocationAdd from './pages/location-add.vue';

const routes = [
  {
    path: '/whs/',
    component: Index,
  },
  {
    path: '/whs/item/',
    component: ItemDetails,
  },
  {
    path: '/whs/item-add/',
    component: ItemAdd,
  },
  {
    path: '/whs/tag-add/',
    component: TagAdd,
  },
  {
    path: '/whs/location-add/',
    component: LocationAdd,
  },
];

export default routes;
