import Index from '../../addons-common/pages/index.vue';
import Add from '../../addons-common/pages/add.vue';
import Settings from '../../addons-common/pages/settings.vue';
import History from '../../addons-common/pages/history.vue';

const routes = [
  {
    path: '/health_vitals/pedometer/',
    component: Index,
  },
  {
    path: '/health_vitals/pedometer/add/',
    component: Add,
  },
  {
    path: '/health_vitals/pedometer/settings/',
    component: Settings,
  },
  {
    path: '/health_vitals/pedometer/history/',
    component: History,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      vitalsElement: 'pedometer',
      chartType: 'column',
      chartColor: '#1498CE',
      chartWeekSumsDays: true,
      chartMonthSumsDays: true,
    },
  };
});

export default routes;
