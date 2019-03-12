import Index from '../../../../addons_common/vitals_element/pages/index.vue';
import Add from '../../../../addons_common/vitals_element/pages/add.vue';
import Settings from '../../../../addons_common/vitals_element/pages/settings.vue';
import History from '../../../../addons_common/vitals_element/pages/history.vue';

const routes = [
  {
    path: '/vitals_temperature/',
    component: Index,
  },
  {
    path: '/vitals_temperature/add/',
    component: Add,
  },
  {
    path: '/vitals_temperature/settings/',
    component: Settings,
  },
  {
    path: '/vitals_temperature/history/',
    component: History,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      addon: 'vitals_temperature',
      vitalsElement: 'temperature',
    },
  };
});

export default routes;
