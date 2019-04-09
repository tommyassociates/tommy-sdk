import IndexPage from './pages/index.vue';
import TemplateCreatePage from './pages/template-create.vue';
import TemplateDetailsPage from './pages/template-details.vue';
import TemplateEditPage from './pages/template-edit.vue';
import AssignmentCreatePage from './pages/assignment-create.vue';
import AssignmentDetailsPage from './pages/assignment-details.vue';
import AssignmentEditPage from './pages/assignment-edit.vue';
import ShortcutCreatePage from './pages/shortcut-create.vue';
import ShortcutEditPage from './pages/shortcut-edit.vue';

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
  {
    path: '/forms/assignment-details/:id/',
    component: AssignmentDetailsPage,
  },
  {
    path: '/forms/assignment-edit/:id/',
    component: AssignmentEditPage,
  },

  {
    path: '/forms/shortcut-create/',
    component: ShortcutCreatePage,
  },
  {
    path: '/forms/shortcut-edit/:id/',
    component: ShortcutEditPage,
  },
];

export default routes;
