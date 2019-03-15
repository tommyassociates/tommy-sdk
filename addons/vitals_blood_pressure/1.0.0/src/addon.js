import Index from './pages/index.vue';
import Add from './pages/add.vue';
import Settings from './pages/settings.vue';
import History from './pages/history.vue';

const routes = [
  {
    path: '/vitals_blood_pressure/',
    component: Index,
  },
  {
    path: '/vitals_blood_pressure/add/',
    component: Add,
  },
  {
    path: '/vitals_blood_pressure/settings/',
    component: Settings,
  },
  {
    path: '/vitals_blood_pressure/history/',
    component: History,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      addon: 'vitals_blood_pressure',
      vitalsElement: 'blood_pressure',
    },
  };
});

export default routes;
