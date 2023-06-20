import tommy from 'tommy-core/src/tommy.js';
import routes from './routes.js';
import appComponent from './components/app.vue';
// import components from './components.js';
// import { registerStoreModule, storeModuleIsRegistered } from 'tommy-core/src/utils/modules';

const language = localStorage.language || 'en-US';

import './scss/sdk.scss';

import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';


const importAddon = (addon) => {
  return (addon.dir_prefix.includes('tommy-sdk-private') ? 
    import(`../../tommy-sdk-private/addons/${addon.package}/${addon.environment}/src/addon.js`) :
    import(`../addons/${addon.package}/${addon.environment}/src/addon.js`))
}

const loadAddonLocales = (addon) => {
  return new Promise((resolve) => {
    if (!addon.locales || addon.locales.length === 0) return resolve()

    const iterables = addon.locales.map(language => {
      // return import(`@addon/${addon.package}/${addon.environment}/locales/${language}.json`)
      return import(`./addons/${addon.package}/${addon.environment}/locales/${language}.json`)
        .then((locales) => {
          return {
            [language]: {
              [addon.package]: locales.default
            }
          }
        })
        .catch(err => {
          // console.log('addon: locale load failed', err, addon.title, language, addon);
        });
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
  // components,
  data() {
    const actorId = localStorage.actorId ? parseInt(localStorage.actorId, 10) : null;
    const accounts = null;
    let token = localStorage.token;
    let user = null;
    let account = null;
    let loggedIn = false;
    if (token && user && account) {
      loggedIn = true;
    } else {
      token = null;
    }

    return {
      actorId,
      token,
      loggedIn,
    };
  },
  methods: {
    loadLocalAddons() {
      return this.$request.get('addons', { responseType: 'json' });
    },
    async mounted() {
      console.log('sdk: mounted', import.meta.env);
      localStorage.setItem('serverUrl', import.meta.env.TOMMY_API_URL);
      const localAddons = await this.loadLocalAddons();
      console.table(localAddons);

      // Change the account to the previous logged in account on refresh.
      const previousAccount = {
        id: localStorage.getItem('account_id'),
        type: localStorage.getItem('account_type'),
        ignoreAddons: true
      }

      const payload = {
        data: {
          api_key: import.meta.env.TOMMY_API_KEY,
        },
        options: {
          user: false,
          addons: false,
        }
      };
      this.$store.dispatch('login', payload).then((token) => {
        if (previousAccount.type !== 'user') {
          this.$store.dispatch('changeAccount', previousAccount);
        }
        localAddons.forEach(addon => {
          // addon.environment = addon.environment || 'production';

          // FIXME: Skip production addons for now - just work on development 
          // addons until we can fix internal environment specific routing
          if (!addon.environment || addon.environment === 'production') return;

          if (addon.assets) {
            loadAddonLocales(addon);
            importAddon(addon)            
              .then(addonModule => {
                console.log('sdk: addon loaded', addon.title, addon);
                const isModule = !!addonModule.default.routes;
                const routes = isModule ? addonModule.default.routes : addonModule.default;

                // routes.forEach(x => x.path = `/${addon.environment}${x.path}`);
                const addonIndexView = routes.length ? routes[0] : {};
                addon.entry_path = addonIndexView.path;

                this.$store.state.addons.addonInstalls.push(addon);

                this.$f7.routes.push(...routes);
                this.$f7.views.main.routes.push(...routes);

                // FIXME: Cannot use registerModule with replaceState due to a vuex bug
                // if (isModule) {
                //   const { name: moduleName, store: moduleStore } = addonModule.default;
                //   if (storeModuleIsRegistered(this.$store, moduleName)) {
                //     console.log('sdk: store module already registered', moduleName);
                //   } else {
                //     console.log('sdk: registering store module', moduleName, moduleStore);
                //     registerStoreModule(this.$store, moduleStore, moduleName);
                //   }
                // }

                // Load the default addon if specified
                // (SDK_CONFIG.defaultPath &&
                  // SDK_CONFIG.defaultPath === addon.entry_path) ||
                  // 
                const loadAddon = window.location.href.indexOf(addon.entry_path) !== -1
                if (loadAddon) {
                  const entryUrl = this.addonUrl(addon)
                  console.log('loading initial addon', entryUrl)
                  this.$f7.views.main.router.navigate(entryUrl)
                }
              })
              .catch(err => {
                console.log('addon: js load failed', err, addon.title, addon);
              });
          }
        });
      }).catch((error) => {
        this.$f7.dialog.alert(`Cannot connect to sandbox server: ${import.meta.env.TOMMY_API_URL}: ${error}`);
      });
    },
    addonUrl(addon) {
      let url = addon.entry_path;
      if (this.$root.actorId) url += `?actor_id=${this.$root.actorId}`;
      return url;
    },
  },
  f7ready(f7) {
  },
});
