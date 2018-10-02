import tommy, { app, events, addons } from '../../tommy_app/src/tommy/tommy'; // eslint-disable-line
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
    const accounts = null;
    let token = localStorage.token;
    let user = null;
    let account = null;
    let team = null;
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
    }
    if (token && user && account) {
      loggedIn = true;
    } else {
      token = null;
      user = null;
      account = null;
      team = null;
    }

    return {
      token,
      user,
      account,
      accounts,
      team,
      loggedIn,
      language,
      addons: window.SDK_LOCAL_ADDONS,
    };
  },
  methods: {
    // Language
    setLanguage(lang) {
      const self = this;
      const changed = self.language !== lang;
      localStorage.language = lang;
      self.language = lang;
      if (changed) {
        self.$i18n.setLanguage(lang);
        self.$events.$emit('languageChanged', lang);
      }
    },
    // User
    setUser(user, token) {
      const self = this;
      if (user) {
        self.user = user;
        localStorage.user = JSON.stringify(user);
      }
      if (token) {
        localStorage.token = token;
        self.token = token;
      }
      if (user && user.locale) {
        self.setLanguage(user.locale);
      }
      self.$events.$emit('userChanged', user);
    },
    getUser(callback) {
      const self = this;
      self.$api.getCurrentUser().then((user) => {
        if (callback) callback(user);
      });
    },
    updateUser(callback) {
      const self = this;
      self.getUser((user) => {
        self.setUser(user);
        if (callback) callback(user);
      });
    },
    // Team
    setTeam(team) {
      const self = this;
      self.team = team;
      localStorage.team = JSON.stringify(team);
      self.$events.$emit('teamChanged', team);
    },
    getTeam(callback) {
      const self = this;
      self.$api.getCurrentTeam().then((team) => {
        if (callback) callback(team);
      });
    },
    updateTeam(callback) {
      const self = this;
      self.getTeam((team) => {
        self.setTeam(team);
        if (callback) callback(team);
      });
    },
    // Accounts
    setAccounts(accounts) {
      const self = this;
      self.accounts = accounts;
      self.$events.$emit('accountsChanged', accounts);
    },
    getAccounts(callback) {
      const self = this;
      self.$api.getAccounts({ cache: false }).then((accounts) => {
        if (callback) callback(accounts);
      });
    },
    updateAccounts(callback) {
      const self = this;
      self.getAccounts((accounts) => {
        self.setAccounts(accounts);
        if (callback) callback(accounts);
      });
    },
    // Account
    setAccount(account) {
      const self = this;
      self.account = account;
      localStorage.account = JSON.stringify(account);
      self.$events.$emit('accountChanged', account);
      self.updateAccounts();
    },
    getAccount(callback) {
      const self = this;
      self.$api.getCurrentAccount().then((account) => {
        if (callback) callback(account);
      });
    },
    updateAccount(callback) {
      const self = this;
      self.getAccount((account) => {
        self.setAccount(account);
        if (callback) callback(account);
      });
    },
    changeAccount(id, type, location_id) {
      const self = this;
      self.$api
        .updateCurrentAccount(id, type, location_id, { configKey: 'account' })
        .then((account) => {
          self.$api.resetCache();
          self.setAccount(account);

          // TODO: Init addons
          // addons.init() // only affects once
          // addons.reloadAllRemote()
        });
    },
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
