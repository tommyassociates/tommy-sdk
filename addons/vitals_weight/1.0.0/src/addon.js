import Index from '../../../../addons_common/vitals_element/pages/index.vue';
import Add from '../../../../addons_common/vitals_element/pages/add.vue';
import Settings from '../../../../addons_common/vitals_element/pages/settings.vue';
import History from '../../../../addons_common/vitals_element/pages/history.vue';

const routes = [
  {
    path: '/vitals_weight/',
    component: Index,
  },
  {
    path: '/vitals_weight/add/',
    component: Add,
  },
  {
    path: '/vitals_weight/settings/',
    component: Settings,
  },
  {
    path: '/vitals_weight/history/',
    component: History,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      addon: 'vitals_weight',
      vitalsElement: 'weight',
    },
  };
});

export default routes;
