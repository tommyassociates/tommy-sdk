import Index from './pages/index.vue';
import Add from './pages/add.vue';
import Edit from './pages/edit.vue';
import Settings from './pages/settings.vue';
import History from './pages/history.vue';
import Plan from './pages/plan.vue';

const routes = [
  {
    path: '/vitals_medication_reminder/',
    component: Index,
  },
  {
    path: '/vitals_medication_reminder/plan/',
    component: Plan,
  },
  {
    path: '/vitals_medication_reminder/add/',
    component: Add,
  },
  {
    path: '/vitals_medication_reminder/edit/:id/',
    component: Edit,
  },
  {
    path: '/vitals_medication_reminder/settings/',
    component: Settings,
  },
  {
    path: '/vitals_medication_reminder/history/',
    component: History,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      addon: 'vitals_medication_reminder',
      vitalsElement: 'medication_reminder',
    },
  };
});

export default routes;
