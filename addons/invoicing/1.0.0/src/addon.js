import API from './api';

import IndexPage from './pages/index.vue';
import SettingsPage from './pages/settings.vue';
import ItemServiceManagementPage from './pages/item-service-management.vue';
import ListManagementPage from './pages/list-management.vue';
import ListAddPage from './pages/list-add.vue';
import ListEditPage from './pages/list-edit.vue';
import DateRangePage from './pages/date-range.vue';
import TagSelectPage from './pages/tag-select-page.vue';
import ProductDetailsPage from './pages/product-details.vue';
import PackageDetailsPage from './pages/package-details.vue';
import RangeSelectPage from './pages/range-select.vue';
import OrderDetailsPage from './pages/order-details.vue';
import OrderDetailsNursePage from './pages/order-details-nurse.vue';
import PromotionManagementPage from './pages/promotion-management.vue';
import PromotionDetailsPage from './pages/promotion-details.vue';

const routes = [
  {
    path: '/invoicing/',
    component: IndexPage,
  },
  {
    path: '/invoicing/settings/',
    component: SettingsPage,
  },
  {
    path: '/invoicing/item-service-management/',
    component: ItemServiceManagementPage,
  },
  {
    path: '/invoicing/list-management/',
    component: ListManagementPage,
  },
  {
    path: '/invoicing/promotion-management/',
    component: PromotionManagementPage,
  },
  {
    path: '/invoicing/list-add/',
    component: ListAddPage,
  },
  {
    path: '/invoicing/list-edit/date-range/',
    component: DateRangePage,
  },
  {
    path: '/invoicing/list-edit/:listId/',
    component: ListEditPage,
  },
  {
    path: '/invoicing/tag-select/',
    component: TagSelectPage,
  },
  {
    path: '/invoicing/product-details/:id?/',
    component: ProductDetailsPage,
  },
  {
    path: '/invoicing/package-details/:id?/',
    component: PackageDetailsPage,
  },
  {
    path: '/invoicing/range-select/',
    component: RangeSelectPage,
  },
  {
    path: '/invoicing/order-details/:id?/',
    popup: {
      async(to, from, resolve) {
        resolve({
          component: API.isNurse ? OrderDetailsNursePage : OrderDetailsPage,
        });
      },
    },
  },
  {
    path: '/invoicing/promotion-details/:id?/',
    component: PromotionDetailsPage,
  },
];

export default routes;
