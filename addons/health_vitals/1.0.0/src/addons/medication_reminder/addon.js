import Index from './pages/index.vue';
import Add from './pages/add.vue';
import Edit from './pages/edit.vue';
import Settings from './pages/settings.vue';
import History from './pages/history.vue';
import Plan from './pages/plan.vue';

const routes = [
  {
    path: '/health_vitals/medication_reminder/',
    component: Index,
  },
  {
    path: '/health_vitals/medication_reminder/plan/',
    component: Plan,
  },
  {
    path: '/health_vitals/medication_reminder/add/',
    component: Add,
  },
  {
    path: '/health_vitals/medication_reminder/edit/:id/',
    component: Edit,
  },
  {
    path: '/health_vitals/medication_reminder/settings/',
    component: Settings,
  },
  {
    path: '/health_vitals/medication_reminder/history/',
    component: History,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      vitalsElement: 'medication_reminder',
    },
  };
});

export default routes;
