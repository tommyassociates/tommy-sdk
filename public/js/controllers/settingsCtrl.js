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

            api.getCurrentTeamMembers().then(function(response) {
                console.log('settingsCtrl: loadTeamMembers: ', response)
                var currentActorId = localStorage.getItem('actorId')
                if (currentActorId) {
                    for (var i = 0; i < response.length; i++) {
                        if (response[i].user_id == currentActorId)
                            response[i].selected = true
                    }
                }

                // , $page.find('select[name="actor-select"]')
                TM.renderInline('teamMemberSelectOptionsTemplate', response)

                // $page.on('change', 'select[name="team-member"]', function(event) {
                //     var value = $$(this).val()
                //     localStorage.setItem('actorId', value)
                //     console.log('set current actor', value)
                // })
            })
            // actor-select
        },

    };

    return settingsCtrl;
});
