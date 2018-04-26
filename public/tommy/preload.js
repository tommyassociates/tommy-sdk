define(['app','api','config'],
function(app,api,config) {

    var preload = {
        load: function() {
            // Reset API cache before load
            api.resetCache()

            // Build call array
            var calls = []
            calls.push(preload.loadAccounts())
            if (config.getCurrentAccount().team_id) {
                calls.push(preload.loadTeam())
                calls.push(preload.loadTeamMembers())
            }
            calls.push(preload.loadInstalledAddons())

            return Promise.all(calls)
        },

        loadAccounts: function() {
            return api.getCurrentTeam().then(function(response) {
                app.t7.global.accounts = response
            })
        },

        loadTeam: function() {
            return api.getCurrentTeam().then(function(response) {
                app.t7.global.team = response
                config.setCurrentTeam(response)
            })
        },

        loadTeamMembers: function() {
            return api.getCurrentTeamMembers().then(function(response) {
                app.t7.global.teamMembers = response
            })
        },

        loadInstalledAddons: function() {
            // api.getInstalledAddons({ url: SANDBOX_ENDPOINT, cache: true })
            return api.getInstalledAddons()
        }
    }

    return preload;
});
