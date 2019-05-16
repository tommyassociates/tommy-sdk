import Index from './pages/index.vue';
import Add from './pages/add.vue';
import Settings from './pages/settings.vue';
import History from './pages/history.vue';

const routes = [
  {
    path: '/health_vitals/blood_pressure/',
    component: Index,
  },
  {
    path: '/health_vitals/blood_pressure/add/',
    component: Add,
  },
  {
    path: '/health_vitals/blood_pressure/settings/',
    component: Settings,
  },
  {
    path: '/health_vitals/blood_pressure/history/',
    component: History,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      vitalsElement: 'blood_pressure',
    },
  };
});

export default routes;
