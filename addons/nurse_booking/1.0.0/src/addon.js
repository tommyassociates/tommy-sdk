import IndexPage from './pages/index.vue';
import VipPage from './pages/vip.vue';
import VipDetailsPage from './pages/vip-details.vue';
import ServiceListPage from './pages/service-list.vue';
import ServiceDetailsPage from './pages/service-details.vue';

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
];

export default routes;