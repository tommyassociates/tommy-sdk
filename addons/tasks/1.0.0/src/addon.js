import IndexPage from './pages/index.vue';
import TaskAddPage from './pages/task-add.vue';
import TaskDetailsPage from './pages/task-details.vue';
import ListManagementPage from './pages/list-management.vue';
import ListAddPage from './pages/list-add.vue';
import ListEditPage from './pages/list-edit.vue';
import DateRangePage from './pages/date-range.vue';
import TagSelectPage from './pages/tag-select-page.vue';

const routes = [
  {
    path: '/tasks/',
    component: IndexPage,
  },
  {
    path: '/tasks/task/:taskId/',
    popup: {
      component: TaskDetailsPage,
    },
  },
  {
    path: '/tasks/list-edit/:listId/',
    component: ListEditPage,
  },
  {
    path: '/tasks/task-add/',
    component: TaskAddPage,
  },
  {
    path: '/tasks/list-management/',
    component: ListManagementPage,
  },
  {
    path: '/tasks/list-add/',
    component: ListAddPage,
  },
  {
    path: '/tasks/list-edit/:listId/date-range/',
    component: DateRangePage,
  },
  {
    path: '/tasks/list-edit/:listId/tag-select/',
    component: TagSelectPage,
  },
];

export default routes;
