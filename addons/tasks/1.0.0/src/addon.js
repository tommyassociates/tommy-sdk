import IndexPage from './pages/index.vue';
import TaskAddPage from './pages/task-add.vue';
import TaskDetailsPage from './pages/task-details.vue';
import ListManagementPage from './pages/list-management.vue';
import ListAddPage from './pages/list-add.vue';

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
    path: '/tasks/list-edit/:id/',
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
];

export default routes;
