define(['app','config','api','util','cache','preload','addons','tplManager','tplHelpers'],
function(app,config,api,util,cache,preload,addons,TM,TH) {

    var appCtrl = {
        init: function() {
            if (!config.isAuthenticated()) {
                appCtrl.onInvalidSession()
            }
            else {
                console.log('starting session')

                appCtrl.initCurrentAccount()
                    .then(function() {
                        console.log('session loaded')
                        app.f7view.router.load({
                            url: 'local-addons.html',
                            animatePages: false
                        })
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
            // if (account.team_id) {
            //     api.getCurrentTeam().then(function(response) {
            //         config.setCurrentTeam(response)
            //     })
            // }
            // else {
            //     config.setCurrentTeam(null)
            // }

            // Set the current avatar
            // util.renderCurrentAvatar()

            // Populate the account menu
            // appCtrl.loadUserAccounts()

            // // // Reload all addons
            // addons.init()
            // // addons.loadAllRemote()
            // addons.onViewLoaded = function (manifest, view) {
            //     // appCtrl.renderAccountHeader()
            //     // VM.module('appView').renderMainMenu(account)
            // }

            // Get installed addons
            // api.getInstalledAddons({ url: SANDBOX_ENDPOINT, cache: true })
        },

        initCurrentAccount: function() { //success, error
            console.log('appCtrl', 'initCurrentAccount')

            // Always reload on initialization
            return api.getCurrentAccount()
                .then(appCtrl.onCurrentAccountChanged)
                .then(preload.load)
                .catch(appCtrl.onInvalidSession)
                // .then(success)
                // .catch(error)
        },

        changeCurrentAccount: function(accountID, accountType, locationId) {
            api.resetCache()
            api.updateCurrentAccount(accountID, accountType, locationId)
                .then(appCtrl.onCurrentAccountChanged)
                .then(preload.load)
        },

        // loadAddons: function() {
        //     addons.init()
        //     addons.onAddonLoaded = CM.module('addonCtrl').onAddonLoaded;
        //     addons.onViewLoaded = CM.module('addonCtrl').onViewLoaded;
        //
        //     for (var i = 0; i < SDK_LOCAL_ADDONS.length; i++) {
        //         var addon = SDK_LOCAL_ADDONS[i];
        //         console.log('loaded local addon', addon)
        //         addons.initAddon(addon)
        //     }
        //
        //     // return addons.loadAllRemote()
        //     // (function (addons) {
        //
        //     // })
        //
        //     // addons.onViewLoaded = function (manifest, view) {
        //     //     // console.log('on view loaded', manifest, view)
        //     //     // alert('virtual method')
        //     // }
        // },

        // loadRecommendedAddons: function() {
        //     api.getRecommendedAddons().then(function(response) {
        //         TM.renderInline('mainMenuRecommendedAddons', response)
        //     })
        // },

        // loadUserAccounts: function() {
        //     api.getAccounts().then(function(response) {
        //         app.t7.global.accounts = response;
        //     })
        // },

    };

    return appCtrl;
})
