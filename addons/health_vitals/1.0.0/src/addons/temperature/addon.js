import Index from '../../addons-common/pages/index.vue';
import Add from '../../addons-common/pages/add.vue';
import Settings from '../../addons-common/pages/settings.vue';
import History from '../../addons-common/pages/history.vue';

const routes = [
  {
    path: '/health_vitals/temperature/',
    component: Index,
  },
  {
    path: '/health_vitals/temperature/add/',
    component: Add,
  },
  {
    path: '/health_vitals/temperature/settings/',
    component: Settings,
  },
  {
    path: '/health_vitals/temperature/history/',
    component: History,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      vitalsElement: 'temperature',
    },
  };
});

export default routes;
