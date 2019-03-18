const routes = [
  {
    path: '/vitals_weight/',
    component: 'tommy-vitals-element-index',
  },
  {
    path: '/vitals_weight/add/',
    component: 'tommy-vitals-element-add',
  },
  {
    path: '/vitals_weight/settings/',
    component: 'tommy-vitals-element-settings',
  },
  {
    path: '/vitals_weight/history/',
    component: 'tommy-vitals-element-history',
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
