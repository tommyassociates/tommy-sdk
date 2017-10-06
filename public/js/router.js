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
            // app.f7.onPageBeforeAnimation('*', router.pageBeforeAnimation);
            app.f7.onPageAfterAnimation('*', router.pageAfterAnimation);
            // app.f7.onPageBack('*', router.pageBack);
            // app.f7.onPageAfterBack('*', router.pageAfterBack);
        },

        pageAfterAnimation: function(page) {
            console.log('router', 'pageAfterAnimation', page);
            switch (page.name) {
                case 'local-addons':
                    // clear last addon cache
                    localStorage.setItem('lastAddon', null)
                    localStorage.setItem('lastAddonView', null)
                    break;
            }
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
                default:
                    var $page = $$(page.container);
                    if ($page.data('addon')) {
                        CM.module('addonCtrl').initAddon(page);
                    }
            }
        },

        preprocess: function(content, url, next) {
            if (!url) return content;
            // url = url.split('?')[0];

            console.log('router', 'preprocess', url);

            content = addons.preprocess(content, url);

            return content;
        }
    };

    return router;
});
