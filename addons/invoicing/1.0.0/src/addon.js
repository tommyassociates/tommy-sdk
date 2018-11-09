import IndexPage from './pages/index.vue';
import SettingsPage from './pages/settings.vue';
import ItemServiceManagementPage from './pages/item-service-management.vue';
import ListManagementPage from './pages/list-management.vue';
import ListAddPage from './pages/list-add.vue';
import ListEditPage from './pages/list-edit.vue';
import DateRangePage from './pages/date-range.vue';
import TagSelectPage from './pages/tag-select-page.vue';
import ItemDetailsPage from './pages/item-details.vue';
import PackageDetailsPage from './pages/package-details.vue';
import RangeSelectPage from './pages/range-select.vue';
import OrderDetailsPage from './pages/order-details.vue';

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
    path: '/invoicing/item-details/:id?/',
    component: ItemDetailsPage,
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
    path: '/invoicing/order-details/:id/',
    component: OrderDetailsPage,
  },
];

export default routes;
