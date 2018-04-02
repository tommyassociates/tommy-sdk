define(['app','config','api','util','cache','tplManager','tplHelpers','addons'],
function(app,config,api,util,cache,TM,TH,addons) {

    var appCtrl = {
        init: function() {
            if (!config.isAuthenticated()) {
                appCtrl.onInvalidSession()
            }
            else {
                console.log('starting session')

                appCtrl.initCurrentAccount(function() {
                    app.f7view.router.load({
                        url: 'local-addons.html',
                        // query: {
                        //   addon: localStorage.getItem('defaultView'),
                        //   view: localStorage.getItem('defaultView')
                        // }, //$$.parseUrlQuery(window.location.href),
                        animatePages: false
                    })
                }, function() {
                    appCtrl.onInvalidSession()
                })
            }
        },

        onInvalidSession: function() {
            console.log('invalid session')
            config.destorySession()
            // tommyView.router.loadPage('views/login.html')
        },

        onCurrentAccountChanged: function(account) {
            console.log('appCtrl', 'onCurrentAccountChanged', account)

            // Store the current account
            config.setCurrentAccount(account)
            config.setCurrentAvatar(account.icon_url)

            // Update the current team if required
            if (account.team_id) {
                api.getCurrentTeam().then(function(response) {
                    config.setCurrentTeam(response)
                    // appCtrl.renderAccountHeader(account)
                    // VM.module('appView').renderAccountHeader(account)
                    // VM.module('appView').renderMainMenu(account)
                })
            }
            else {
                config.setCurrentTeam(null)
                // appCtrl.renderAccountHeader(account)
                // VM.module('appView').renderAccountHeader(account)
                // VM.module('appView').renderMainMenu(account)
            }

            // Set the current avatar
            // util.renderCurrentAvatar()

            // Populate the account menu
            appCtrl.loadUserAccounts()

            // // // Reload all addons
            // addons.init()
            // // addons.loadAllRemote()
            // addons.onViewLoaded = function (manifest, view) {
            //     // appCtrl.renderAccountHeader()
            //     // VM.module('appView').renderMainMenu(account)
            // }

            // Get installed addons
            api.getInstalledAddons({ url: SANDBOX_ENDPOINT, cache: true })
            // .then(success).catch(error)
        },

        initCurrentAccount: function(success, error) {
            console.log('appCtrl', 'initCurrentAccount')

            // Always reload on initialization
            api.getCurrentAccount()
              .then(function(response) {
                  appCtrl.onCurrentAccountChanged(response)
                  // addons.loadAllRemote().then(success)

                  // TODO: Should wait for API callbacks to return
                  if (success)
                      success()
              }).catch(error)
        },

        loadAddons: function() {
            addons.init()
            addons.onAddonLoaded = CM.module('addonCtrl').onAddonLoaded;
            addons.onViewLoaded = CM.module('addonCtrl').onViewLoaded;

            for (var i = 0; i < SDK_LOCAL_ADDONS.length; i++) {
                var addon = SDK_LOCAL_ADDONS[i];
                console.log('loaded local addon', addon)
                addons.initAddon(addon)
            }

            // return addons.loadAllRemote()
            // (function (addons) {

            // })

            // addons.onViewLoaded = function (manifest, view) {
            //     // console.log('on view loaded', manifest, view)
            //     // alert('virtual method')
            // }
        },

        // loadRecommendedAddons: function() {
        //     api.getRecommendedAddons().then(function(response) {
        //         TM.renderInline('mainMenuRecommendedAddons', response)
        //     })
        // },

        loadUserAccounts: function() {
            api.getAccounts().then(function(response) {
                app.t7.global.accounts = response;
            })
        },

        changeCurrentAccount: function(accountID, accountType, locationId) {
            api.updateCurrentAccount(accountID, accountType, locationId).then(function(response) {
                api.resetCache()
                appCtrl.onCurrentAccountChanged(response)
            })
        },

    };

    return appCtrl;
})
