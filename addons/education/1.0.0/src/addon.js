import Splash from './pages/splash.vue';
import Index from './pages/index.vue';

const routes = [
  {
    path: '/education-index/',
    component: Index,
  },
  {
    path: '/education/',
    async(to, from, resolve, reject) {
      if (localStorage.getItem('education.splash')) {
        resolve({
          component: Index,
        });
      } else {
        localStorage.setItem('education.splash', true);
        resolve({
          component: Splash,
        });
      }
    },
  },
];
export default routes;
