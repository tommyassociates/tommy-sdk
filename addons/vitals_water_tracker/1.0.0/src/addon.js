import Index from './pages/index.vue';
import Add from './pages/add.vue';
import Settings from './pages/settings.vue';
import History from './pages/history.vue';
import Plan from './pages/plan.vue';

const routes = [
  {
    path: '/vitals_water_tracker/',
    component: Index,
  },
  {
    path: '/vitals_water_tracker/add/',
    component: Add,
  },
  {
    path: '/vitals_water_tracker/settings/',
    component: Settings,
  },
  {
    path: '/vitals_water_tracker/history/',
    component: History,
  },
  {
    path: '/vitals_water_tracker/plan/',
    component: Plan,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      addon: 'vitals_water_tracker',
      vitalsElement: 'water_tracker',
    },
  };
});

export default routes;
