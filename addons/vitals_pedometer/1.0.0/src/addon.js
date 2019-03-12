import Index from '../../../../addons_common/vitals_element/pages/index.vue';
import Add from '../../../../addons_common/vitals_element/pages/add.vue';
import Settings from '../../../../addons_common/vitals_element/pages/settings.vue';
import History from '../../../../addons_common/vitals_element/pages/history.vue';

const routes = [
  {
    path: '/vitals_pedometer/',
    component: Index,
  },
  {
    path: '/vitals_pedometer/add/',
    component: Add,
  },
  {
    path: '/vitals_pedometer/settings/',
    component: Settings,
  },
  {
    path: '/vitals_pedometer/history/',
    component: History,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      addon: 'vitals_pedometer',
      vitalsElement: 'pedometer',
      chartType: 'column',
      chartWeekSumsDays: true,
      chartMonthSumsDays: true,
    },
  };
});

export default routes;
