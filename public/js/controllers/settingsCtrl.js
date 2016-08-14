define(['util','config','api'],
function(util,config,api) {
    // var formChanged = false;,

    // var appCtrl = require('controllers/appCtrl');

    var settingsCtrl = {
        init: function() {

          //     $page.on('change', 'select[name="current-user"]', function(event) {
          //       var values = $$(this).val().split('-');
          //       T.sdk.changeAccount(values[0], values[1]);
          //     });

            // var bindings = [{
            //     element: '#change-profile-picture',
            //     event: 'click',
            //     handler: settingsCtrl.appCtrl
            // },{
            //     element: '#open-apple-review',
            //     event: 'click',
            //     handler: tommyApp.closeModal
            // },{
            //     element: '.logout-button',
            //     event: 'click',
            //     handler: settingsCtrl.logOut
            // }];

            // VM.module('accountView').init(config.getCurrentAccount(), bindings);

            // $$('#open-apple-review').on('click', function() {
            //     tommyApp.closeModal();
            // });

            // Handle profile picture changing
            // if (util.isPhonegap()) {
                // var bindings = [{
                //     element: '#change-profile-picture',
                //     event: 'click',
                //     handler: settingsCtrl.appCtrl
                // }];
                //
                // util.bindEvents(bindings);
            // }
            // else {
            //     $$('#edit-profile-picture-btn').hide();
            // }

            // Render the team profile
            // if (config.isTeamOwnerOrManager()) {
            //     api.getCurrentTeamWithCache(function(currentTeam) {
            //       var teamBindings = [{
            //           element: '#team-form',
            //           event: 'submit change',
            //           handler: settingsCtrl.onUpdateTeam
            //       }];
            //
            //       VM.module('accountView').renderTeamProfile(currentTeam, teamBindings);
            //     });
            // }
            //
            // // Render the user profile
            // var userBindings = [{
            //     element: '#user-form',
            //     event: 'submit change',
            //     handler: settingsCtrl.onUpdateUser
            // }];
            // VM.module('accountView').renderUserProfile(config.getCurrentUser(), userBindings);

            // api.getAccounts(function(response) {
            //     var renderData = {
            //         appName: i18n.app.name,
            //         accounts: response
            //     };
            //
            //     VM.module('accountView').renderAccountList(renderData);
            // });

            // var parentId = 0;
            // xhr.call({
            //     func: 'list/about/'+parentId
            // }, function(response) {
            //         if (response.status === 0) {
            //             var data = response.data;
            //             var output = TM.renderTarget('helpListTemplate',data);
            //
            //             $$('#account-more-info-list').append(output);
            //         } else {
            //             tommyApp.alert(response.message);
            //         }
            // });
        },

    };

    return settingsCtrl;
});
