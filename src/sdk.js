// import tommy, { app, events, addons } from '../../tommy_app/src/tommy/tommy'; // eslint-disable-line
import tommy, { app, events, addons } from 'tommy_core/src/tommy'; // eslint-disable-line
import routes from './routes';
import appComponent from './components/app.vue';
import components from './components';

const language = localStorage.language || 'en-US';

app.init({
  appEl: '#tommy-sdk',
  appComponent,
  routes,
  language,
  locales: {},
  components,
  data() {
    const actorId = localStorage.actorId ? parseInt(localStorage.actorId, 10) : null;
    const accounts = null;
    let token = localStorage.token;
    let user = null;
    let account = null;
    let team = null;
    let teamMembers = null;
    let loggedIn = false;
    if (token) {
      if (localStorage.user) {
        try {
          user = JSON.parse(localStorage.user);
        } catch (e) {
          // no user
        }
      }
      if (localStorage.account) {
        try {
          account = JSON.parse(localStorage.account);
        } catch (e) {
          // no user
        }
      }
      if (localStorage.team) {
        try {
          team = JSON.parse(localStorage.team);
        } catch (e) {
          // no user
        }
      }
      if (localStorage.teamMembers) {
        try {
          teamMembers = JSON.parse(localStorage.teamMembers);
        } catch (e) {
          // no user
        }
      }
    }
    if (token && user && account) {
      loggedIn = true;
    } else {
      token = null;
      user = null;
      account = null;
      team = null;
      teamMembers = null;
    }

    return {
      actorId,
      token,
      user,
      account,
      accounts,
      team,
      teamMembers,
      loggedIn,
      language,
      addons: [],
    };
  },
  methods: {
    mounted() {
      const self = this;
      localStorage.setItem('serverUrl', window.SANDBOX_URL);

      // Auth
      self.$api
        .call({
          endpoint: 'sessions',
          method: 'POST',
          data: { api_key: window.SDK_CONFIG.apiKey },
        })
        .then((response) => {
          self.setUser(response, response.token);
          self.updateAccount();
          self.updateTeam();
          self.updateTeamMembers();

          events.$on('addonRoutesLoaded', (addon, addonRoutes) => {
            self.$f7.routes.push(...addonRoutes);
            self.$f7.views.main.routes.push(...addonRoutes);
          });
          events.$on('addonLoaded', (addon) => {
            self.$root.addons.push(addon);
          });
          window.SDK_LOCAL_ADDONS.forEach((addon) => {
            self.$addons.initAddon(addon).catch(() => {});
          });
        })
        .catch((error) => {
          self.$f7.dialog.alert(`Cannot connect to sandbox server: ${window.SANDBOX_ENDPOINT}: ${error}`);
        });
    },
  },
  f7ready(f7) { // eslint-disable-line
    const self = this; // eslint-disable-line
  },
});

export default tommy;
