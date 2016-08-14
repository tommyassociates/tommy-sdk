define(['app','config','api','util','cache','tplManager','tplHelpers','addons'],
function(app,config,api,util,cache,TM,TH,addons) {

    var appCtrl = {
        init: function() {
            if (!config.isAuthenticated()) {
                appCtrl.onInvalidSession();
            }
            else {
                appCtrl.initCurrentAccount(function() {
                    tommyView.router.loadPage('local-addons.html');
                }, function() {
                    appCtrl.onInvalidSession();
                });
            }
        },

        onInvalidSession: function() {
            config.destorySession();
            // tommyView.router.loadPage('views/login.html');
        },

        onCurrentAccountChanged: function(account) {
            console.log('appCtrl', 'onCurrentAccountChanged', account);

            // Store the current account
            config.setCurrentAccount(account);
            config.setCurrentAvatar(account.icon_url);

            // Update the current team if required
            if (account.team_id) {
                api.getCurrentTeam(function(response) {
                    config.setCurrentTeam(response);
                    // appCtrl.renderAccountHeader(account);
                    // VM.module('appView').renderAccountHeader(account);
                    // VM.module('appView').renderMainMenu(account);
                });
            }
            else {
                config.setCurrentTeam(null);
                // appCtrl.renderAccountHeader(account);
                // VM.module('appView').renderAccountHeader(account);
                // VM.module('appView').renderMainMenu(account);
            }

            // Set the current avatar
            util.renderCurrentAvatar();

            // Populate the account menu
            appCtrl.loadUserAccounts();

            // // // Reload all addons
            // addons.init();
            // // addons.loadAllRemote();
            // addons.onViewLoaded = function (manifest, view) {
            //     // appCtrl.renderAccountHeader();
            //     // VM.module('appView').renderMainMenu(account);
            // }

            // // If the user is oeprating as a developer we need to refresh to
            // if (response.type === 'Developer') {
            //
            // }

            // FIXME: location_id currently unset
            // window.defaultLocation = currentAccount.location_id;

            // if (response.type === 'User' ||
            //     response.type === 'TeamMember') { // || data.type === 'Manage'
            //     $$('.employ').on('click', function () {
            //         window.employ_link_on = true;
            //         $(".animer").animate({top: "-" + $('.acc-slide').height() + "px"}, 250);
            //     });
            // }

            // tommyView.router.reloadPage('views/dashboard.html');
            // tommyView.router.loadPage('views/chat.html');
            // $$('#dashboard-avatar').css('background-color','red');

            // showloader means current page is main pages,
            // also mean we need to refresh current page
            // TODO: needs to have another paramater such as reload current page.
            // if (showLoader) {
            //     console.log('appCtrl: initCurrentAccount: load chat chat');
            //     tommyView.router.reloadPage('views/chat.html');
            // }
        },

        // renderAccountHeader: function(account) {
        //     // var account = cache.set('session', 'currentAccount');
        //     //     accounts = cache.get('session', 'userAccounts');
        //
        //     // Only render the nav header when
        //     // if (!account || !accounts) {
        //     //     return false;
        //     // }
        //
        //     VM.module('appView').renderAccountHeader(account);
        // },

        initCurrentAccount: function(success, error) {
            console.log('appCtrl', 'initCurrentAccount');

            // Always reload on initialization
            api.getCurrentAccount(function(response) {
                appCtrl.onCurrentAccountChanged(response);
                if (success)
                    success();
            }, error);
        },

        // loadAddons: function() {
        //     addons.init();
        //     addons.loadAllRemote(function (addons) {
        //
        //     });
        //
        //     // addons.onViewLoaded = function (manifest, view) {
        //     //     // console.log('on view loaded', manifest, view);
        //     //     // alert('virtual method');
        //     // }
        // },

        // loadRecommendedAddons: function() {
        //     api.getRecommendedAddons(function(response) {
        //         TM.renderInline('mainMenuRecommendedAddons', response);
        //     });
        // },

        loadUserAccounts: function() {
            api.getAccounts(function(response) {
                app.t7.global.accounts = response;

                // var $accountMenu = $$('#top-menu');

                // Render the account list
                // $accountMenu.find('#top-account-list')[response.length > 1 ? 'show' : 'hide']();
                // var $accountList = $$('#main-menu-account-list');
                // TM.renderTarget('mainMenuAccountList', response, $accountList);
                //
                // $accountList.find('a.change-account').on('click', function(event) {
                //     var accountID = $$(this).attr('data-account-id');
                //     var accountType = $$(this).attr('data-account-type');
                //     var locationId = $$(this).attr('data-location-id');
                //
                //     appCtrl.changeCurrentAccount(accountID, accountType, locationId);
                //
                //     $accountList.removeClass('active');
                // });
                //
                // // Allow switching to previous account in developer mode
                // $accountList.find('.cancel-developer-mode').on('click', function(event) {
                //     appCtrl.cancelDeveloperMode();
                //     event.stopPropagation();
                // });

                // var pageHeight = $$(window).height();
                // $accountMenu.find('#top-account-menu-dropdown').css('max-height', (pageHeight-100)+'px');
                // $accountMenu.find('#top-account-menu-dropdown').css('height',(pageHeight-100)+'px');
                // $accountMenu.find('#top-account-menu-dropdown').css('overflow','scroll');
                // $accountMenu.find('#top-account-menu-dropdown').css('-webkit-overflow-scrolling ','touch');
            });
        },

        changeCurrentAccount: function(accountID, accountType, locationId) {
            api.updateCurrentAccount(accountID, accountType, locationId, function(response) {

                // // Handle developer account switching
                // if (response.developer)
                //     appCtrl.enableDeveloperMode();

                appCtrl.onCurrentAccountChanged(response);

                // // Reload the chat page
                // // TODO: Reload current page
                // // tommyView.router.reloadPage('views/chat.html');
                // console.log('appCtrl', 'changeCurrentAccount', 'reload current page', tommyView.activePage);
                // tommyView.router.reloadPage(tommyView.activePage.url); //'views/chat.html'
            });
        },

        // enableDeveloperMode: function() { //account
        //     if (config.isDeveloperMode()) {
        //         alert('Already in developer mode');
        //         return false;
        //     }
        //
        //     // if (!account.developer) {
        //     //     alert('Current account is not a developer account');
        //     //     return false;
        //     // }
        //
        //     config.setDeveloperMode(true, config.getCurrentAccount());
        // },
        //
        // cancelDeveloperMode: function() {
        //     config.setDeveloperMode(false);
        //
        //     var previousAccount = config.getPreviousAccount();
        //     if (previousAccount) {
        //         // appCtrl.onCurrentAccountChanged(previousAccount);
        //         appCtrl.changeCurrentAccount(previousAccount.id, previousAccount.type, null);
        //     }
        //     else {
        //         tommyApp.alert('No previous account stored. Please logout and login again.');
        //     }
        // },
        //
        // i18next: function(viewName, content) {
        //     var output = VM.module(viewName).i18next(content);
        //     return output;
        // },
        //
        // i18nextQuery: function(viewName, content, query) {
        //     var output = VM.module(viewName).i18nextQuery(content, query);
        //     return output;
        // },

        // bindEvents: function() {
        //     var bindings = [{
        //         element: document,
        //         selector: 'div.item-image > img',
        //         event: 'click',
        //         handler: VM.module('appView').photoBrowser
        //     }];
        //
        //     util.bindEvents(bindings);
        // }
        // ,
        //
        // showToolbar: function() {
        //     util.showToolbar();
        // }
    };

    // appCtrl.bindEvents();

    return appCtrl;
});
