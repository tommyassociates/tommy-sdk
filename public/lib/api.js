define(['xhr','util','config','cache'], function(xhr,util,config,cache) {

    var api = {
        call: function(options, success, error) { //, showLoader
            // if (showLoader !== false)
            //     util.showLoader();
            // options.url = config.getApiUrl();

            if (typeof(success) !== 'undefined' && options.cache && options.endpoint) {
                var cachedResponse = cache.get('api', options.endpoint);
                if (cachedResponse) {
                    console.log('api: returning cached response', cachedResponse);
                    success(cachedResponse);
                    return;
                }
            }

            // options.url = options.url ? options.url : config.getApiUrl();
            options.url = options.url || config.getApiUrl();
            if (options.endpoint)
                options.url += options.endpoint;

            // console.log('api: request', data);
            return xhr.call(options, function(response) {
                // console.log('api: response', data.func, response);
                if (options.cache && options.endpoint) {
                    cache.set('api', options.endpoint, response);
                }
                if (typeof(success) !== 'undefined')
                    success(response);
                // if (showLoader !== false)
                //     util.hideLoader();
            }, error);
        },

        login: function(emailOrPhone, password, success, error) {
            return this.call({
                endpoint: 'sessions',
                method: 'POST',
                data: {
                    login: emailOrPhone,
                    password: password
                }
            }, success, error);
        },

        registerDevice: function(uuid, type, success, error) {
            return this.call({
                endpoint: 'devices',
                method: 'POST',
                data: {
                    uuid: uuid,
                    type: type
                }
            }, success, error);
        },

        unregisterDevice: function(uuid, success, error) {
            return this.call({
                endpoint: 'devices/' + uuid,
                method: 'DELETE'
            }, success, error);
        },

        createUser: function(data, success, error) {
            return this.call({
                endpoint: 'users',
                method: 'POST',
                data: data
            }, success, error);
        },

        updateUser: function(user_id, data, success, error) {
            return this.call({
                endpoint: 'users/' + user_id,
                method: 'PUT',
                data: data
            }, success, error);
        },

        getAccounts: function(success, error) {
            return this.call({
                endpoint: 'user/accounts',
                method: 'GET'
            }, success, error);
        },

        getCurrentUser: function(success, error) {
            return this.call({
                endpoint: 'user',
                method: 'GET'
            }, success, error);
        },

        updateCurrentUser: function(data, success, error) {
            return this.call({
                endpoint: 'user',
                method: 'PUT',
                data: data
            }, success, error);
        },

        getCurrentAccount: function(success, error, showLoader) {
            return this.call({
                endpoint: 'user/current_account',
                method: 'GET'
            }, success, error, showLoader);
        },

        getCurrentTeam: function(success, error, showLoader) {
            return this.call({
                endpoint: 'team',
                method: 'GET'
            }, success, error, showLoader);
        },

        // deprecated
        getCurrentTeamWithCache: function(success, error, showLoader) {
            var currentTeam = config.getCurrentTeam();
            if (currentTeam && typeof(success) === 'function')
                success(currentTeam);
            this.getCurrentTeam(function(response) {
                config.setCurrentTeam(response);
                if (typeof(success) === 'function')
                    success(response);
            }, error, showLoader);
        },

        getCurrentTeamTags: function(cache, success, error) {
            return this.call({
                endpoint: 'team/tags',
                method: 'GET',
                cache: cache
            }, success, error);
        },

        getCurrentTeamMembers: function(success, error, showLoader) {
            return this.call({
                endpoint: 'team/members',
                method: 'GET'
            }, success, error, showLoader);
        },

        getCurrentTeamMember: function(user_id, success, error, showLoader) {
            return this.call({
                endpoint: 'team/members/' + user_id,
                method: 'GET'
            }, success, error, showLoader);
        },

        updateCurrentTeamMember: function(user_id, data, success, error, showLoader) {
            return this.call({
                endpoint: 'team/members/' + user_id,
                method: 'PUT',
                data: data
            }, success, error, showLoader);
        },

        createTeam: function(data, success, error) {
            return this.call({
                endpoint: 'teams',
                method: 'POST',
                data: data
            }, success, error);
        },

        updateTeam: function(team_id, data, success, error) {
            return this.call({
                endpoint: 'teams/' + team_id,
                method: 'PUT',
                data: data
            }, success, error);
        },

        updateCurrentAccount: function(account_id, account_type, location_id, success, error) {
            return this.call({
                endpoint: 'user/current_account',
                method: 'PUT',
                data: {
                    current_account_id: account_id,
                    current_account_type: account_type,
                    current_location_id: location_id
                }
            }, success, error);
        },

        getContacts: function(success, error) {
            return this.call({
                endpoint: 'contacts',
                method: 'GET',
                data: {
                    team_id: config.getCurrentTeamId()
                }
            }, success, error);
        },

        getContact: function(user_id, success, error) {
            return this.call({
                endpoint: 'contacts/' + user_id,
                method: 'GET'
            }, success, error);
        },

        updateContact: function(user_id, data, success, error) {
            return this.call({
                endpoint: 'contacts/' + user_id,
                method: 'PUT',
                data: data
            }, success, error);
        },

        getChat: function(chat_id, success, error) {
            return this.call({
                endpoint: 'chats/' + chat_id,
                method: 'GET'
            }, success, error);
        },

        initiateChat: function(user_ids, success, error) {
            return this.call({
                endpoint: 'chats/initiate',
                method: 'POST',
                data : { user_ids: user_ids }
            }, success, error);
        },

        getChatMessages: function(chat_id, success, error) {
            return this.call({
                endpoint: 'chats/' + chat_id + '/messages',
                method: 'GET'
            }, success, error);
        },

        getChatUsers: function(chat_id, success, error) {
            return this.call({
                endpoint: 'chats/' + chat_id + '/users',
                method: 'GET'
            }, success, error);
        },

        getRecentChatMessages: function(success, error) {
            return this.call({
                endpoint: 'messages/recent',
                method: 'GET'
            }, success, error);
        },

        getFavoriteChatMessages: function(success, error) {
            return this.call({
                endpoint: 'messages/favorite',
                method: 'GET'
            }, success, error);
        },

        sendMessage: function(chat_id, message, send_at, success, error) {
            return this.call({
                endpoint: 'messages',
                method: 'POST',
                data: {
                    chat_id: chat_id,
                    message: message,
                    send_at: send_at
                }
            }, success, error);
        },

        sendDirectMessage: function(receiver_ids, message, send_at, success, error) {
            return this.call({
                endpoint: 'messages',
                method: 'POST',
                data: {
                    message: message,
                    receiver_ids: receiver_ids,
                    send_at: send_at
                }
            }, success, error);
        },

        //
        // Addons
        //

        getAddons: function(success, error) {
            return this.call({
                endpoint: 'addons',
                method: 'GET'
            }, success, error);
        },

        getInstalledAddons: function(success, error) {
            return this.call({
                endpoint: 'addons/installed',
                method: 'GET'
            }, success, error);
        },

        getRecommendedAddons: function(success, error) {
            return this.call({
                endpoint: 'addons/recommended',
                method: 'GET'
            }, success, error);
        },

        getAddon: function(package, success, error) {
            return this.call({
                endpoint: 'addons/' + package,
                method: 'GET'
            }, success, error);
        },

        getAddonFile: function(package, version, fileName, success, error) {
            return this.call({
                endpoint: 'addons/' + package + '/versions/' + version + '/files/' + fileName,
                method: 'GET'
            }, success, error);
        },

        installAddon: function(package, params, success, error) {
            return this.call({
                endpoint: 'addons/' + package + '/install',
                method: 'POST',
                data: params
            }, success, error);
        },

        uninstallAddon: function(package, success, error) {
            return this.call({
                endpoint: 'addons/' + package + '/install',
                method: 'DELETE'
            }, success, error);
        },

        getInstalledAddonSetting: function(package, name, success, error) {
            return this.call({
                endpoint: 'addons/' + package + '/settings/' + name,
                method: 'GET'
            }, success, error);
        },

        updateInstalledAddonSetting: function(package, name, data, success, error) {
            return this.call({
                endpoint: 'addons/' + package + '/settings/' + name,
                method: 'PUT',
                data: data
            }, success, error);
        },

        //
        // Actions
        //

        getActions: function(success, error) {
            return this.call({
                endpoint: 'actions',
                method: 'GET'
            }, success, error);
        },

        getAction: function(action_id, success, error) {
            return this.call({
                endpoint: 'actions/' + action_id,
                method: 'GET'
            }, success, error);
        },

        getActionVariableList: function(action_id, success, error) {
            return this.call({
                endpoint: 'actions/' + action_id + '/variables',
                method: 'GET'
            }, success, error);
        },

        getInstalledActions: function(success, error) {
            return this.call({
                endpoint: 'actions/installed',
                method: 'GET'
            }, success, error);
        },

        getRecentActions: function(success, error) {
            return this.call({
                endpoint: 'actions/recent',
                method: 'GET'
            }, success, error);
        },

        getActionTriggers: function(success, error) {
            return this.call({
                endpoint: 'actions/triggers',
                method: 'GET'
            }, success, error);
        },

        getActionConditions: function(success, error) {
            return this.call({
                endpoint: 'actions/conditions',
                method: 'GET'
            }, success, error);
        },

        getActionActivities: function(success, error) {
            return this.call({
                endpoint: 'actions/activities',
                method: 'GET'
            }, success, error);
        },

        installAction: function(action_id, install_dependencies, success, error) {
            return this.call({
                endpoint: 'actions/' + action_id + '/install',
                method: 'POST',
                data: {
                    install_dependencies: install_dependencies
                }
            }, success, error);
        },

        uninstallAction: function(action_id, success, error) {
            return this.call({
                endpoint: 'actions/' + action_id + '/install',
                method: 'DELETE'
            }, success, error);
        },

        updateInstalledAction: function(action_id, data, success, error) {
            return this.call({
                endpoint: 'actions/' + action_id + '/install',
                method: 'PUT',
                data: data
            }, success, error);
        },

        runInstalledAction: function(action_id, success, error) {
            return this.call({
                endpoint: 'actions/' + action_id + '/install/run',
                method: 'GET'
            }, success, error);
        },

        getInstalledAction: function(action_id, success, error) {
            return this.call({
                endpoint: 'actions/' + action_id + '/install',
                method: 'GET'
            }, success, error);
        },

        getInstalledActionEvents: function(action_id, success, error) {
            return this.call({
                endpoint: 'actions/' + action_id + '/events',
                method: 'GET'
            }, success, error);
        },

        getInstalledActionSetting: function(action_id, scope, success, error) {
            return this.call({
                endpoint: 'actions/' + action_id + '/settings/' + scope,
                method: 'GET'
            }, success, error);
        },

        updateInstalledActionSetting: function(action_id, scope, data, success, error) {
            return this.call({
                endpoint: 'actions/' + action_id + '/settings/' + scope,
                method: 'PUT',
                data: data
            }, success, error);
        },

        //
        // Custom Actions
        //

        createCustomAction: function(data, success, error) {
            return this.call({
                endpoint: 'custom_actions',
                method: 'POST',
                data: data
            }, success, error);
        },

        getCustomAction: function(action_id, success, error) {
            return this.call({
                endpoint: 'custom_actions/' + action_id,
                method: 'GET'
            }, success, error);
        },

        updateCustomAction: function(action_id, data, success, error) {
            return this.call({
                endpoint: 'custom_actions/' + action_id,
                method: 'PUT',
                data: data
            }, success, error);
        },

        //
        // Events
        //

        getEvents: function(params, success, error) {
            return this.call({
                endpoint: 'events',
                method: 'GET',
                data: params
            }, success, error);
        },

        createEvent: function(data, success, error) {
            return this.call({
                endpoint: 'events',
                method: 'POST',
                data: data
            }, success, error);
        },

        updateEvent: function(event_id, data, success, error) {
            return this.call({
                endpoint: 'events/' + event_id,
                method: 'PUT',
                data: data
            }, success, error);
        }
    };

    return api;
});
