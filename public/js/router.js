define(['config','app','util','tplManager','controllers/module','addons'], //, 'xhr' , 'underscore'
function(config,app,util,TM,CM,addons) {
    // var $$ = Dom7;
    // var t7 = Template7;

    var router = {

        init: function() {
            console.log('router: init');

            // app.f7.onPageInit('settings', router.initSettings);
            // app.f7.onPageInit('addon-details', router.initAddonDetails);

            app.f7.onPageInit('*', router.pageInit);
            // tommyApp.onPageBeforeAnimation('*', router.pageBeforeAnimation);
            // tommyApp.onPageAfterAnimation('*', router.pageAfterAnimation);
            // tommyApp.onPageBack('*', router.pageBack);
            // tommyApp.onPageAfterBack('*', router.pageAfterBack);
        },

        pageInit: function(page) {
            console.log('router', 'pageInit', page);

            switch (page.name) {
                case 'index':
                    break;
                case 'settings':
                    CM.module('settingsCtrl').init(page);
                    break;
                case 'local-addons':
                    CM.module('addonCtrl').initLocalAddons(page);
                    break;
                case 'addon-details':
                    CM.module('addonCtrl').initAddonDetails(page);
                    break;
            }
        },

        preprocess: function(content, url, next) {
            if (!url) return content;
            // url = url.split('?')[0];

            console.log('router', 'preprocess', url);

            content = addons.preprocess(content, url);

            return content;
        }
        // initSettings: function(page) {
        //     console.log('router', 'initSettings', page);
        //     var $page = $$(page.container)//,
        //       // package = page.query.package,
        //       // version = page.query.version;
        //
        //     $page.on('change', 'select[name="current-user"]', function(event) {
        //       var values = $$(this).val().split('-');
        //       T.sdk.changeAccount(values[0], values[1]);
        //     });
        // },
        //
        // initAddonDetails: function(page) {
        //     console.log('router', 'initAddonDetails', page);
        //     var $page = $$(page.container),
        //       package = page.query.package,
        //       version = page.query.version;
        //
        //     // Query addon installed status from the sandbox server
        //     T.sdk.initAddonDetailsSandbox(package, version);
        //     T.sdk.initAddonDetailsStore(package, version);
        //
        //     // Sandbox actions
        //     $page.on('click', 'a[data-command="sandbox-upload"]', function() {
        //       T.sdk.uploadSandboxAddon(package, version);
        //     });
        //
        //     $page.on('click', 'a[data-command="sandbox-delete"]', function() {
        //       T.sdk.deleteSandboxAddon(package, version);
        //     });
        //
        //     // Store actions
        //     $page.on('click', 'a[data-command="store-submit"]', function() {
        //       T.sdk.submitStoreAddon(package, version);
        //     });
        //
        //     $page.on('click', 'a[data-command="store-delete"]', function() {
        //       T.sdk.deleteStoreAddon(package, version);
        //     });
        // }
    };

    return router;
});
