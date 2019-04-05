import IndexPage from './pages/index.vue';
import TemplateCreatePage from './pages/template-create.vue';
import TemplateDetailsPage from './pages/template-details.vue';
import TemplateEditPage from './pages/template-edit.vue';
import AssignmentCreatePage from './pages/assignment-create.vue';


const routes = [
  {
    path: '/forms/',
    component: IndexPage,
  },
  {
    path: '/forms/template-create/',
    component: TemplateCreatePage,
  },
  {
    path: '/forms/template-details/:id/',
    component: TemplateDetailsPage,
  },
  {
    path: '/forms/template-edit/:id/',
    component: TemplateEditPage,
  },
  {
    path: '/forms/assignment-create/',
    component: AssignmentCreatePage,
  },
];

export default routes;
