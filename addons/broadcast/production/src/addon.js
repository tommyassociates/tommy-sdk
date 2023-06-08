import IndexPage from './pages/index.vue';
import Message from './pages/message.vue';
import NewMessage from './pages/new-message.vue';
import Setting from './pages/setting.vue';

import './addon.scss';

const routes = [
  {
    path: '/broadcast/',
    component: IndexPage,
  },
  {
    path: '/broadcast/message/',
    component: Message,
  },
  {
    path: '/broadcast/new-message/',
    component: NewMessage,
  },
  {
    path: '/broadcast/setting/',
    component: Setting,
  },
];

export default routes;
