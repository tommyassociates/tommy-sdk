const routes = [
  {
    path: '/vitals_height/',
    component: 'tommy-vitals-element-index',
  },
  {
    path: '/vitals_height/add/',
    component: 'tommy-vitals-element-add',
  },
  {
    path: '/vitals_height/settings/',
    component: 'tommy-vitals-element-settings',
  },
  {
    path: '/vitals_height/history/',
    component: 'tommy-vitals-element-history',
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
