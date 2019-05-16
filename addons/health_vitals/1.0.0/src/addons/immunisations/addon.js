import Index from './pages/index.vue';
import Add from './pages/add.vue';
import Details from './pages/details.vue';
import Settings from './pages/settings.vue';
import History from './pages/history.vue';
import Archive from './pages/archive.vue';

const routes = [
  {
    path: '/health_vitals/immunisations/',
    component: Index,
  },
  {
    path: '/health_vitals/immunisations/add/',
    component: Add,
  },
  {
    path: '/health_vitals/immunisations/details/',
    component: Details,
  },
  {
    path: '/health_vitals/immunisations/settings/',
    component: Settings,
  },
  {
    path: '/health_vitals/immunisations/history/',
    component: History,
  },
  {
    path: '/health_vitals/immunisations/archive/',
    component: Archive,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      vitalsElement: 'immunisations',
    },
  };
});

export default routes;
