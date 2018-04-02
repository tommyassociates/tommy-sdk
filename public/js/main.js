(function() {
    var lang = localStorage.getItem('lang') || 'en-us';
    require.config({
        config: {
            moment: {
                noGlobal: true
            }
        },
        locale: lang,
        waitSeconds: 200,
        paths: {
            text: '/tommy/vendors/require/text',
            //i18n: '/tommy/vendors/require/i18n',
            config: '/tommy/config',
            app: '/tommy/app',
            api: '/tommy/api',
            addons: '/tommy/addons',
            cache: '/tommy/cache',
            util: '/tommy/util',
            xhr: '/tommy/xhr',
            tplHelpers: '/tommy/templates/tplHelpers',
            tplManager: '/tommy/templates/tplManager',
            photoChanger: '/tommy/components/photoChanger',
            tagSelect: '/tommy/components/tagSelect',
            moment: '/tommy/vendors/moment.min',
            Framework7: '/tommy/vendors/framework7/framework7',
            GTPL: '/global.tpl.html',
            i18next: '../tommy/vendors/i18next.min',
            i18n: '../tommy/i18n'
        },
        shim: {
            'Framework7': {exports: 'Framework7'}
        }
    })

    require(['Framework7','app','router','api','util','config','addons','tplManager','tplHelpers','controllers/module','i18n','text!GTPL','/tommy/export.js'],
    function(Framework7,app,router,api,util,config,addons,TM,TH,CM,i18n,GTPL) {
        var main = {
            init: function() {
                window.$$ = Dom7;

                i18n.init({
                    lng: config.getLocale(), // 'dev', //'zh-CN'
                    debug: true,
                    fallbackLng: true,
                    load: 'all',
                }, function(err, t) {

                    app.init({
                        pushState: false,
                        // preroute: preroute,
                        // preprocess: preprocess,
                        modalTitle: '',
                        precompileTemplates: true,
                        template7Pages: true,
                        // template7Data: {
                        //     'page:settings': function() { return T.env.data; }
                        // }
                        // pushState: true, //config.environment == 'development', //false, // breaks controller initialization
                        popupCloseByOutside: false,
                        // animateNavBackIcon: true,
                        cache: true, //config.environment == 'production',
                        template7Pages: true,
                        // modalTitle: i18n.global.modal_title,
                        // modalButtonOk: i18n.global.modal_button_ok,
                        // modalButtonCancel: i18n.global.cancel,
                        preprocess: router.preprocess,
                        tapHold: true,
                        swipePanel: 'left',
                        swipeBackPage: false,
                        smartSelectBackTemplate: '<div class="left sliding"><a href="#" class="back link icon-only"><i class="material-icons md-36">keyboard_arrow_left</i></a></div>'
                    })

                    $$('body').append(GTPL)

                    // Set the API to use the sandbox endpoint by default
                    api.url = SANDBOX_ENDPOINT

                    TM.initGlobalVariables()
                    TH.init()

                    router.init()

                    main.authenticate()
                    main.initLocalAddons()
                })
            },

            authenticate: function() {
                api.call({
                    // url: API_ENDPOINT,
                    endpoint: 'sessions',
                    method: 'POST',
                    data: { api_key: SDK_CONFIG.apiKey }
                }).then(function(response) {
                    console.log('authenticated', response)
                    config.setCurrentUser(response, response.token)
                    CM.module('appCtrl').init()
                }).catch(function(error) {
                    console.log('failed', error)
                    app.f7.alert('Cannot connect to sandbox server: ' + SANDBOX_ENDPOINT + ': ' + error)
                    // config.setCurrentUser(response, response.token)
                    // CM.module('appCtrl').init()
                })
            },

            initLocalAddons: function() {
                addons.init()
                addons.onAddonLoaded = CM.module('addonCtrl').onAddonLoaded;
                addons.onViewLoaded = CM.module('addonCtrl').onViewLoaded;

                for (var i = 0; i < SDK_LOCAL_ADDONS.length; i++) {
                    var addon = SDK_LOCAL_ADDONS[i];
                    console.log('loaded local addon', addon)
                    addons.initAddon(addon)
                }
            }
        }

        main.init()
    })
})()
