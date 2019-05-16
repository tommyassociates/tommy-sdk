import Index from './pages/index.vue';
import Add from './pages/add.vue';
import Settings from './pages/settings.vue';
import History from './pages/history.vue';
import Plan from './pages/plan.vue';

const routes = [
  {
    path: '/health_vitals/water_tracker/',
    component: Index,
  },
  {
    path: '/health_vitals/water_tracker/add/',
    component: Add,
  },
  {
    path: '/health_vitals/water_tracker/settings/',
    component: Settings,
  },
  {
    path: '/health_vitals/water_tracker/history/',
    component: History,
  },
  {
    path: '/health_vitals/water_tracker/plan/',
    component: Plan,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      vitalsElement: 'water_tracker',
    },
  };
});

export default routes;
