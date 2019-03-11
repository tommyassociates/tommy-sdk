import Index from '../../../../addons_common/vitals_element/pages/index.vue';
import Add from '../../../../addons_common/vitals_element/pages/add.vue';
import Settings from '../../../../addons_common/vitals_element/pages/settings.vue';
import History from '../../../../addons_common/vitals_element/pages/history.vue';

const routes = [
  {
    path: '/vitals_height/',
    component: Index,
  },
  {
    path: '/vitals_height/add/',
    component: Add,
  },
  {
    path: '/vitals_height/settings/',
    component: Settings,
  },
  {
    path: '/vitals_height/history/',
    component: History,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      addon: 'vitals_height',
      vitalsElement: 'height',
    },
  };
});

export default routes;
