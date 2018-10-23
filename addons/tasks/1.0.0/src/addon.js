import IndexPage from './pages/index.vue';
import TaskAddPage from './pages/task-add.vue';
import TaskDetailsPage from './pages/task-details.vue';

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
];

export default routes;
