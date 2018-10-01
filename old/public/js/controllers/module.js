define(['controllers/appCtrl',
        'controllers/addonCtrl',
        'controllers/settingsCtrl'
      ],function(appCtrl,addonCtrl,settingsCtrl) {

    var module = {
        module: function(name) {
            var controller;

            switch (name) {
                case 'appCtrl':
                    controller = appCtrl;
                    break;
                case 'addonCtrl':
                    controller = addonCtrl;
                    break;
                case 'settingsCtrl':
                    controller = settingsCtrl;
                    break;
            }

            return controller;
        }
    };

    return module;
});
