import tommy from 'tommy-core/src/tommy'; // eslint-disable-line
import routes from './routes';
import appComponent from './components/app.vue';
import components from './components';

import { registerStoreModule, storeModuleIsRegistered } from 'tommy-core/src/utils/modules';

const language = localStorage.language || 'en-US';

import './scss/sdk.scss';

import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';

// console.log('SDK_LOCAL_ADDONS', SDK_LOCAL_ADDONS)
// console.log('SDK_CONFIG', SDK_CONFIG)
// console.log('SANDBOX_URL', SANDBOX_URL)
// console.log('API_URL', API_URL)
// console.log('API_KEY', API_KEY)

const loadAddonLocales = (addon) => {
  return new Promise((resolve) => {
    if (!addon.locales || addon.locales.length === 0) return resolve()

    const iterables = addon.locales.map(language => {
      return import(`@addon/${addon.package}/${addon.version}/locales/${language}.json`)
        .then((locales) => {
          return {
            [language]: {
              [addon.package]: locales.default
            }
          }
        })
    })

    Promise.all(iterables)
      .then((locales) => {
        locales.forEach((locale) => {
          if (!locale) return
          tommy.i18n.addLocales(locale)
        })
      })
  })
}

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
      localStorage.setItem('serverUrl', SANDBOX_URL);

      if (localStorage.miniProgramLocked) {
        this.$root.miniProgramLocked = JSON.parse(localStorage.miniProgramLocked);
      }

      const payload = {
        data: {
          api_key: API_KEY
        },
        options: {
          user: false,
          addons: false,
        }
      };
      this.$store.dispatch('login', payload).then((token) => {
        console.table(SDK_LOCAL_ADDONS);

        SDK_LOCAL_ADDONS.forEach(addon => {
          console.log('addon', addon.title.toUpperCase());

          // Load the addon routes programatically for HMR
          if (addon.assets) {
            loadAddonLocales(addon);
            import(`@addon/${addon.package}/${addon.version}/src/addon.scss`)
            import(`@addon/${addon.package}/${addon.version}/src/addon.js`)
              .then(addonModule => {
                const isModule = !!addonModule.default.routes;
                const routes = isModule ? addonModule.default.routes : addonModule.default;
                const addonIndexView = routes.length ? routes[0] : {};
                addon.entry_path = addonIndexView.path;

                this.$store.state.addons.addonInstalls.push(addon);

                this.$f7.routes.push(...routes);
                this.$f7.views.main.routes.push(...routes);

                if (isModule) {
                  const { name: moduleName, store: moduleStore } = addonModule.default;
                  if (storeModuleIsRegistered(this.$store, moduleName)) {
                    console.log('sdk: store module already registered', moduleName);
                  } else {
                    console.log('sdk: registering store module', moduleName, moduleStore);
                    registerStoreModule(this.$store, moduleStore, moduleName);
                  }
                }

                // Load the default addon if specified
                // const loadAddon = (SDK_CONFIG.defaultAddonPath &&
                //   SDK_CONFIG.defaultAddonPath === addon.entry_path) ||
                //   window.location.href.indexOf(addon.entry_path) !== -1
                // if (loadAddon) {
                //   const entryUrl = this.addonUrl(addon)
                //   // console.log('loading initial addon', entryUrl)
                //   this.$f7.views.main.router.navigate(entryUrl)
                // }

                const loadAddon = (SDK_CONFIG.defaultAddonPath &&
                  SDK_CONFIG.defaultAddonPath.startsWith(addon.entry_path)) ||
                  window.location.href.indexOf(addon.entry_path) !== -1

                if (loadAddon) {
                  const entryUrl = this.addonUrl(addon, SDK_CONFIG.defaultAddonPath)
                  console.log('loading initial addon', entryUrl)
                  this.$f7.views.main.router.navigate(entryUrl)
                }
              })
          }
        });
      }).catch((error) => {
        this.$f7.dialog.alert(`Cannot connect to sandbox server: ${SANDBOX_ENDPOINT}: ${error}`);
      });
    },
    // addonUrl(addon) {
    //   let url = addon.entry_path;
    //   if (this.$root.actorId) url += `?actor_id=${this.$root.actorId}`;
    //   return url;
    // },
    addonUrl(addon, url) {
      if (this.$root.actorId) url += `?actor_id=${this.$root.actorId}`;
      return url;
    },
  },
  f7ready(f7) {
  },
});

// export default tommy;
