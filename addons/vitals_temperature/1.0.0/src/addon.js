const routes = [
  {
    path: '/vitals_temperature/',
    component: 'tommy-vitals-element-index',
  },
  {
    path: '/vitals_temperature/add/',
    component: 'tommy-vitals-element-add',
  },
  {
    path: '/vitals_temperature/settings/',
    component: 'tommy-vitals-element-settings',
  },
  {
    path: '/vitals_temperature/history/',
    component: 'tommy-vitals-element-history',
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
