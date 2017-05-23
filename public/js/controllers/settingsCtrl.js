define(['util','config','api','controllers/appCtrl'],
function(util,config,api,appCtrl) {

    var settingsCtrl = {
        init: function(page) {
            var $page = $$(page.container)

            $page.on('change', 'select[name="current-user"]', function(event) {
                var values = $$(this).val().split('-');
                appCtrl.changeCurrentAccount(values[0], values[1]);
            });
        },

    };

    return settingsCtrl;
});
