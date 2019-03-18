const routes = [
  {
    path: '/vitals_pedometer/',
    component: 'tommy-vitals-element-index',
  },
  {
    path: '/vitals_pedometer/add/',
    component: 'tommy-vitals-element-add',
  },
  {
    path: '/vitals_pedometer/settings/',
    component: 'tommy-vitals-element-settings',
  },
  {
    path: '/vitals_pedometer/history/',
    component: 'tommy-vitals-element-history',
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      addon: 'vitals_pedometer',
      vitalsElement: 'pedometer',
      chartType: 'column',
      chartColor: '#1498CE',
      chartWeekSumsDays: true,
      chartMonthSumsDays: true,
    },
  };
});

export default routes;
