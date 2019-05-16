import Index from '../../addons-common/pages/index.vue';
import Add from '../../addons-common/pages/add.vue';
import Settings from '../../addons-common/pages/settings.vue';
import History from '../../addons-common/pages/history.vue';

const routes = [
  {
    path: '/health_vitals/weight/',
    component: Index,
  },
  {
    path: '/health_vitals/weight/add/',
    component: Add,
  },
  {
    path: '/health_vitals/weight/settings/',
    component: Settings,
  },
  {
    path: '/health_vitals/weight/history/',
    component: History,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      vitalsElement: 'weight',
    },
  };
});

export default routes;
