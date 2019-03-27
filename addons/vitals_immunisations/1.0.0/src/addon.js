import Index from './pages/index.vue';
import Add from './pages/add.vue';
import Details from './pages/details.vue';
import Settings from './pages/settings.vue';
import History from './pages/history.vue';
import Archive from './pages/archive.vue';

const routes = [
  {
    path: '/vitals_immunisations/',
    component: Index,
  },
  {
    path: '/vitals_immunisations/add/',
    component: Add,
  },
  {
    path: '/vitals_immunisations/details/',
    component: Details,
  },
  {
    path: '/vitals_immunisations/settings/',
    component: Settings,
  },
  {
    path: '/vitals_immunisations/history/',
    component: History,
  },
  {
    path: '/vitals_immunisations/archive/',
    component: Archive,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      addon: 'vitals_immunisations',
      vitalsElement: 'immunisations',
    },
  };
});

export default routes;
