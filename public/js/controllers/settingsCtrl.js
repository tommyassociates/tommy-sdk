define(['util','config','api','addons','tplManager','tplHelpers','controllers/appCtrl'],
function(util,config,api,addons,TM,TH,appCtrl) {

    var settingsCtrl = {
        init: function(page) {
            var $page = $$(page.container)

            TM.renderInline('addonViewsRadioListTemplate', addons.getViews(), $page)

            $page.on('change', 'select[name="current-user"]', function(event) {
                var values = $$(this).val().split('-')
                appCtrl.changeCurrentAccount(values[0], values[1])
            })

            $page.on('change', 'input[name="default-addon-view"]', function(event) {
                var value = $$(this).val()
                localStorage.setItem('defaultView', value)
                console.log('set default addon view', value)
            })
        },

    };

    return settingsCtrl;
});
