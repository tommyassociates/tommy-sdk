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
            text: '/lib/vendors/require/text',
            i18n: '/lib/vendors/require/i18n',
            config: '/lib/config',
            app: '/lib/app',
            api: '/lib/api',
            addons: '/lib/addons',
            cache: '/lib/cache',
            util: '/lib/util',
            xhr: '/lib/xhr',
            tplHelpers: '/lib/templates/tplHelpers',
            tplManager: '/lib/templates/tplManager',
            photoChanger: '/lib/components/photoChanger',
            tagSelect: '/lib/components/tagSelect',
            moment: '/lib/vendors/moment.min',
            Framework7: '/lib/vendors/framework7/framework7',
            GTPL: '/global.tpl.html'
        },
        shim: {
            'Framework7': {exports: 'Framework7'}
        }
    });

    require(['Framework7','app','router','api','util','config','addons','tplManager','tplHelpers','controllers/module','i18n!nls/lang','text!GTPL'],
    function(Framework7,app,router,api,util,config,addons,TM,TH,CM,i18n,GTPL) {
        var main = {
            init: function() {
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
                    // pushState: config.environment == 'development', //false, // breaks controller initialization
                    // popupCloseByOutside: false,
                    // animateNavBackIcon: true,
                    // cache: true, //config.environment == 'production',
                    // template7Pages: true,
                    // modalTitle: i18n.global.modal_title,
                    // modalButtonOk: i18n.global.modal_button_ok,
                    // modalButtonCancel: i18n.global.cancel,
                    preprocess: router.preprocess,
                    // tapHold: true,
                    // swipeBackPage: false,
                    // smartSelectBackTemplate: '<div class="left sliding"><a href="#" class="back link icon-only"><i class="material-icons md-36">keyboard_arrow_left</i></a></div>'
                });

                $$('body').append(GTPL);

                // util.bindDynamicSubmitButtons();

                TM.initGlobalVariables();
                TH.init();
                router.init();

                main.authenticate();
                main.initLocalAddons();
            },

            authenticate: function() {
                api.call({
                    endpoint: 'sessions',
                    method: 'POST',
                    data: { api_key: SDK_CONFIG.apiKey }
                }).then(function(response) {
                    console.log('authenticated', response);
                    config.setCurrentUser(response, response.token);
                    CM.module('appCtrl').init();
                });
            },

            initLocalAddons: function() {
                addons.init();
                addons.onAddonLoaded = CM.module('addonCtrl').onAddonLoaded;
                addons.onViewLoaded = CM.module('addonCtrl').onViewLoaded;

                // $$.getJSON('/addons', function (response) {});
                for (var i = 0; i < SDK_ADDONS.length; i++) {
                    var addon = SDK_ADDONS[i];
                    console.log('loaded local addon', addon);
                    addons.initAddon(addon);
                }
            }
        }

        main.init();
    });
})();
