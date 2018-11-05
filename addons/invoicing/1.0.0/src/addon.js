import IndexPage from './pages/index.vue';
// import TaskAddPage from './pages/task-add.vue';
// import TaskDetailsPage from './pages/task-details.vue';
import SettingsPage from './pages/settings.vue';
import ItemServiceManagementPage from './pages/item-service-management.vue';
import ListManagementPage from './pages/list-management.vue';
import ListAddPage from './pages/list-add.vue';
// import ListEditPage from './pages/list-edit.vue';
// import DateRangePage from './pages/date-range.vue';
// import TagSelectPage from './pages/tag-select-page.vue';

const routes = [
  {
    path: '/invoicing/',
    component: IndexPage,
  },
  // {
  //   path: '/invoicing/task/:taskId/',
  //   popup: {
  //     component: TaskDetailsPage,
  //   },
  // },
  // {
  //   path: '/invoicing/list-edit/:listId/',
  //   component: ListEditPage,
  // },
  // {
  //   path: '/invoicing/task-add/',
  //   component: TaskAddPage,
  // },
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
  // {
  //   path: '/invoicing/list-edit/:listId/date-range/',
  //   component: DateRangePage,
  // },
  // {
  //   path: '/invoicing/list-edit/:listId/tag-select/',
  //   component: TagSelectPage,
  // },
];

export default routes;
