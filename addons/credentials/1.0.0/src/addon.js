import Index from './pages/index.vue';
import OAuthCallback from './pages/index.vue';

const routes = [
  {
    path: '/credentials/',
    name: 'credentials__index',
    component: Index,
  },
  // {
  //   path: '/credentials/auth/:provider',
  //   name: 'credentials-oauth',
  //   beforeEnter(to, from, next) {
  //     window.location = `${process.env.API_URL}/v1/auth/${to.params.provider}`
  //   }
  // },
  // {
  //   path: '/credentials/oauth/:provider/callback',
  //   name: 'credentials__oauth-callback',
  //   component: OAuthCallback
  // },
];
export default routes;
