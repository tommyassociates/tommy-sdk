import IndexPage from './pages/index.vue';
import TaskAddPage from './pages/task-add.vue';

const routes = [
  {
    path: '/tasks/',
    component: IndexPage,
  },
  {
    path: '/tasks/task/:id/',
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
