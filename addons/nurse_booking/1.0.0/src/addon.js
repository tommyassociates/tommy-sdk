import IndexPage from './pages/index.vue';
import VipPage from './pages/vip.vue';
import VipDetailsPage from './pages/vip-details.vue';
import ServiceListPage from './pages/service-list.vue';
import ServiceDetailsPage from './pages/service-details.vue';
import LocationPage from './pages/location.vue';

const routes = [
  {
    path: '/nurse_booking/',
    component: IndexPage,
  },
  {
    path: '/nurse_booking/vip/',
    component: VipPage,
  },
  {
    path: '/nurse_booking/vip-details/',
    component: VipDetailsPage,
  },
  {
    path: '/nurse_booking/service-list/',
    component: ServiceListPage,
  },
  {
    path: '/nurse_booking/service-details/:id/',
    component: ServiceDetailsPage,
  },
  {
    path: '/nurse_booking/location/',
    component: LocationPage,
  },
];

export default routes;