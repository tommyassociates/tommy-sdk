import tommy from 'tommy-core/src/tommy'; // eslint-disable-line
import routes from './routes';
import appComponent from './components/app.vue';
import components from './components';
import Highcharts from 'highcharts';

const language = localStorage.language || 'en-US';

import './scss/sdk.scss';

import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';

// console.log('SDK_LOCAL_ADDONS', SDK_LOCAL_ADDONS)
// console.log('SDK_CONFIG', SDK_CONFIG)
// console.log('SANDBOX_URL', SANDBOX_URL)
// console.log('API_URL', API_URL)
// console.log('API_KEY', API_KEY)

if (!window.tommy)
  window.tommy = tommy

tommy.app.init({
  appEl: '#tommy-sdk',
  appComponent,
  routes,
  language,
  locales: {
    'en-US': enUS,
    'zh-CN': zhCN,
  },
  pushState: true,
  components,
  data() {
    const actorId = localStorage.actorId ? parseInt(localStorage.actorId, 10) : null;
    const accounts = null;
    let token = localStorage.token;
    let user = null;
    let account = null;
    // let team = null;
    // let teamMembers = null;
    let loggedIn = false;
    if (token) {
      // if (localStorage.user) {
      //   try {
      //     user = JSON.parse(localStorage.user);
      //   } catch (e) {
      //     // no user
      //   }
      // }
      // if (localStorage.account) {
      //   try {
      //     account = JSON.parse(localStorage.account);
      //   } catch (e) {
      //     // no user
      //   }
      // }
      // if (localStorage.team) {
      //   try {
      //     team = JSON.parse(localStorage.team);
      //   } catch (e) {
      //     // no user
      //   }
      // }
      // if (localStorage.teamMembers) {
      //   try {
      //     teamMembers = JSON.parse(localStorage.teamMembers);
      //   } catch (e) {
      //     // no user
      //   }
      // }
    }
    if (token && user && account) {
      loggedIn = true;
    } else {
      token = null;
      // user = null;
      // account = null;
      // team = null;
      // teamMembers = null;
    }

    return {
      actorId,
      token,
      // user,
      // account,
      // accounts,
      // team,
      // teamMembers,
      loggedIn,
      language,
      addons: [],
      miniProgramLocked: {
        isLocked: false,
        isLockedScreen: false,
        isUnlockScreen: false,
        isOtherLockedMiniProgramsScreen: false,
        isShowMenu: false,
        miniProgram: '',
      },
    };
  },
  methods: {
    mounted() {
      const self = this;
      localStorage.setItem('serverUrl', SANDBOX_URL);

      if (localStorage.miniProgramLocked) {
        self.$root.miniProgramLocked = JSON.parse(localStorage.miniProgramLocked);
      }

      //logout will just clear state.
      // self.$store.dispatch('resetState').then(() => {


      self.$store.dispatch('loginWithApiKey', API_KEY).then((token) => {
        localStorage.token = token;
        self.$root.token = token;

        tommy.events.$on('addonRoutesLoaded', (addon, addonRoutes) => {
          // NOTE: Do not load routes here in order to support HMR
          // self.$f7.routes.push(...addonRoutes);
          // self.$f7.views.main.routes.push(...addonRoutes);
        });
        tommy.events.$on('addonLoaded', (addon) => {
          self.$root.addons.push(addon);
        });
        tommy.events.$on('addonInitError', (addon) => {
          console.error('addonInitError', addon.package, ', added to addons list for rebuild')
          self.$root.addons.push(addon);
        });
        
        SDK_LOCAL_ADDONS.forEach(addon => {
          self.$addons.initAddon(addon)
            .catch(() => {})

          // Load the addon routes programatically for HMR
          if (addon.assets) {
            // console.log(`../${addon.dir_prefix}/${addon.package}/${addon.version}/src/addon.js`)
            import(`@addon/${addon.package}/${addon.version}/src/addon.scss`)
            import(`@addon/${addon.package}/${addon.version}/src/addon.js`)
              .then(m => {
                const routes = m.default;
                self.$f7.routes.push(...routes);
                self.$f7.views.main.routes.push(...routes);

                // console.log(routes);

                // Load the default addon if specified
                const loadAddon = (SDK_CONFIG.autoloadAddonPath &&
                  SDK_CONFIG.autoloadAddonPath === addon.entry_path) ||
                  window.location.href.indexOf(addon.entry_path) !== -1
                if (loadAddon) {
                  const entryUrl = this.addonUrl(addon)
                  // console.log('loading initial addon', entryUrl)
                  self.$f7.views.main.router.navigate(entryUrl)
                }
              })
          }
        });
      }).catch((error) => {
        self.$f7.dialog.alert(`Cannot connect to sandbox server: ${SANDBOX_ENDPOINT}: ${error}`);
      });
    },
    addonUrl(addon) {
      const self = this;
      let url = addon.entry_path;
      if (self.$root.actorId) url += `?actor_id=${self.$root.actorId}`;
      return url;
    },
  },
  f7ready(f7) { // eslint-disable-line
    const self = this; // eslint-disable-line
  },
});

// export default tommy;
