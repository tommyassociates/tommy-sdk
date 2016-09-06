define(['xhr','config','cache','util'], function(xhr,config,cache,util) {

    var api = {
        call: function(options) {
            return new Promise(function(resolve, reject) {
                // if (showLoader !== false)
                //     util.showLoader();
                // options.url = config.getApiUrl();
                // typeof(success) !== 'undefined' &&

                // Get the cached object if available
                if (options.cache && options.endpoint) {
                    var cachedResponse = cache.get('api', options.endpoint);
                    if (cachedResponse) {
                        console.log('api: returning cached response', cachedResponse);
                        resolve(cachedResponse);
                        return;
                    }
                }

                // Set the full URL
                // options.url = options.url ? options.url : config.getApiUrl();
                options.url = options.url || config.getApiUrl();
                if (options.endpoint)
                    options.url += options.endpoint;

                // Setup the Actor ID for managed calls.
                // if (api.actorId) {
                //     if (!options.data)
                //         options.data = {};
                //     options.data['actor_id'] = api.actorId;
                // }

                // Make the XHR request
                // console.log('api: request', options);
                return xhr.call(options, function(response) {
                    // console.log('api: response', data.func, response);

                    // Set the object in the config `localStore` if requested
                    if (options.configKey) {
                        config.setJSON(options.configKey, response);
                    }

                    // Cache the value for next time
                    if (options.cache && options.endpoint) {
                        cache.set('api', options.endpoint, response);
                    }
                    resolve(response);
                    // if (showLoader !== false)
                    //     util.hideLoader();
                }, reject);
            });
        },

        login: function(emailOrPhone, password, options) {
            return this.call(Object.assign({
                endpoint: 'sessions',
                method: 'POST',
                data: {
                    login: emailOrPhone,
                    password: password
                }
            }, options));
        },

        registerDevice: function(platform, environment, uuid, token, options) {
            return this.call(Object.assign({
                endpoint: 'devices',
                method: 'POST',
                data: {
                    platform: platform,
                    environment: environment,
                    uuid: uuid,
                    token: token,
                }
            }, options));
        },

        unregisterDevice: function(token, options) {
            return this.call(Object.assign({
                endpoint: 'devices/' + token,
                method: 'DELETE'
            }, options));
        },

        createUser: function(data, options) {
            return this.call(Object.assign({
                endpoint: 'users',
                method: 'POST',
                data: data
            }, options));
        },

        updateUser: function(user_id, data, options) {
            return this.call(Object.assign({
                endpoint: 'users/' + user_id,
                method: 'PUT',
                data: data
            }, options));
        },

        getAccounts: function(options) {
            return this.call(Object.assign({
                endpoint: 'user/accounts',
                method: 'GET'
            }, options));
        },

        getCurrentUser: function(options) {
            return this.call(Object.assign({
                endpoint: 'user',
                method: 'GET'
            }, options));
        },

        updateCurrentUser: function(data, options) {
            return this.call(Object.assign({
                endpoint: 'user',
                method: 'PUT',
                data: data
            }, options));
        },

        getCurrentAccount: function(options) {
            return this.call(Object.assign({
                endpoint: 'user/current_account',
                method: 'GET'
            }, options));
        },

        getCurrentTeam: function(options) {
            return this.call(Object.assign({
                endpoint: 'team',
                method: 'GET'
            }, options));
        },

        // deprecated
        // getCurrentTeamWithCache: function(options) {
        //     var currentTeam = config.getCurrentTeam();
        //     if (currentTeam && typeof(success) === 'function')
        //         success(currentTeam);
        //     this.getCurrentTeam().then(function(response) {
        //         config.setCurrentTeam(response);
        //         if (typeof(success) === 'function')
        //             success(response);
        //     }); //, error, showLoader
        // },

        getCurrentTeamTags: function(options) {
            return this.call(Object.assign({
                endpoint: 'team/tags',
                method: 'GET',
                // cache: cache
            }, options));
        },

        getCurrentTeamMembers: function(options) {
            return this.call(Object.assign({
                endpoint: 'team/members',
                method: 'GET'
            }, options));
        },

        getCurrentTeamMember: function(user_id, options) {
            return this.call(Object.assign({
                endpoint: 'team/members/' + user_id,
                method: 'GET'
            }, options));
        },

        updateCurrentTeamMember: function(user_id, data, options) {
            return this.call(Object.assign({
                endpoint: 'team/members/' + user_id,
                method: 'PUT',
                data: data
            }, options));
        },

        createTeam: function(data, options) {
            return this.call(Object.assign({
                endpoint: 'teams',
                method: 'POST',
                data: data
            }, options));
        },

        updateTeam: function(team_id, data, options) {
            return this.call(Object.assign({
                endpoint: 'teams/' + team_id,
                method: 'PUT',
                data: data
            }, options));
        },

        updateCurrentAccount: function(account_id, account_type, location_id, options) {
            return this.call(Object.assign({
                endpoint: 'user/current_account',
                method: 'PUT',
                data: {
                    current_account_id: account_id,
                    current_account_type: account_type,
                    current_location_id: location_id
                }
            }, options));
        },

        getContacts: function(options) {
            return this.call(Object.assign({
                endpoint: 'contacts',
                method: 'GET',
                data: {
                    team_id: config.getCurrentTeamId()
                }
            }, options));
        },

        getContact: function(user_id, options) {
            return this.call(Object.assign({
                endpoint: 'contacts/' + user_id,
                method: 'GET'
            }, options));
        },

        updateContact: function(user_id, data, options) {
            return this.call(Object.assign({
                endpoint: 'contacts/' + user_id,
                method: 'PUT',
                data: data
            }, options));
        },

        getChat: function(chat_id, options) {
            return this.call(Object.assign({
                endpoint: 'chats/' + chat_id,
                method: 'GET'
            }, options));
        },

        initiateChat: function(user_ids, options) {
            return this.call(Object.assign({
                endpoint: 'chats/initiate',
                method: 'POST',
                data : { user_ids: user_ids }
            }, options));
        },

        getChatMessages: function(chat_id, options) {
            return this.call(Object.assign({
                endpoint: 'chats/' + chat_id + '/messages',
                method: 'GET'
            }, options));
        },

        getChatUsers: function(chat_id, options) {
            return this.call(Object.assign({
                endpoint: 'chats/' + chat_id + '/users',
                method: 'GET'
            }, options));
        },

        createChatUser: function(chat_id, user_id, options) {
            return this.call(Object.assign({
                endpoint: 'chats/' + chat_id + '/users',
                method: 'POST',
                data: {
                    user_id: user_id
                }
            }, options));
        },

        deleteChatUser: function(chat_id, user_id, options) {
            return this.call(Object.assign({
                endpoint: 'chats/' + chat_id + '/users/' + user_id,
                method: 'DELETE'
            }, options));
        },

        getRecentChatMessages: function(options) {
            return this.call(Object.assign({
                endpoint: 'messages/recent',
                method: 'GET'
            }, options));
        },

        getFavoriteChatMessages: function(options) {
            return this.call(Object.assign({
                endpoint: 'messages/favorite',
                method: 'GET'
            }, options));
        },

        sendMessage: function(chat_id, message, send_at, options) {
            return this.call(Object.assign({
                endpoint: 'messages',
                method: 'POST',
                data: {
                    chat_id: chat_id,
                    message: message,
                    send_at: send_at
                }
            }, options));
        },

        sendDirectMessage: function(receiver_ids, message, send_at, options) {
            return this.call(Object.assign({
                endpoint: 'messages',
                method: 'POST',
                data: {
                    message: message,
                    receiver_ids: receiver_ids,
                    send_at: send_at
                }
            }, options));
        },

        //
        // Addons
        //

        getAddons: function(options) {
            return this.call(Object.assign({
                endpoint: 'addons',
                method: 'GET'
            }, options));
        },

        getInstalledAddons: function(options) {
            return this.call(Object.assign({
                endpoint: 'addons/installed',
                method: 'GET'
            }, options));
        },

        getRecommendedAddons: function(options) {
            return this.call(Object.assign({
                endpoint: 'addons/recommended',
                method: 'GET'
            }, options));
        },

        getAddon: function(package, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package,
                method: 'GET'
            }, options));
        },

        getAddonVersion: function(package, version, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/versions/' + version,
                method: 'GET'
            }, options));
        },

        getAddonFile: function(package, version, fileName, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/versions/' + version + '/files/' + fileName,
                method: 'GET'
            }, options));
        },

        installAddon: function(package, params, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/install',
                method: 'POST',
                data: params
            }, options));
        },

        uninstallAddon: function(package, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/install',
                method: 'DELETE'
            }, options));
        },

        getInstalledAddonSetting: function(package, name, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/settings/' + name,
                method: 'GET'
            }, options));
        },

        updateInstalledAddonSetting: function(package, name, data, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/settings/' + name,
                method: 'PUT',
                data: data
            }, options));
        },

        getInstalledAddonPermissions: function(package, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/permissions',
                method: 'GET'
            }, options));
        },

        getInstalledAddonPermission: function(package, id, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/permissions/' + id,
                method: 'GET'
            }, options));
        },

        updateInstalledAddonPermission: function(package, id, data, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/permissions/' + id,
                method: 'PUT',
                data: data
            }, options));
        },

        //
        // Actions
        //

        getActions: function(options) {
            return this.call(Object.assign({
                endpoint: 'actions',
                method: 'GET'
            }, options));
        },

        getAction: function(action_id, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id,
                method: 'GET'
            }, options));
        },

        getActionVariableList: function(action_id, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/variables',
                method: 'GET'
            }, options));
        },

        getInstalledActions: function(options) {
            return this.call(Object.assign({
                endpoint: 'actions/installed',
                method: 'GET'
            }, options));
        },

        getRecentActions: function(options) {
            return this.call(Object.assign({
                endpoint: 'actions/recent',
                method: 'GET'
            }, options));
        },

        getActionTriggers: function(options) {
            return this.call(Object.assign({
                endpoint: 'actions/triggers',
                method: 'GET'
            }, options));
        },

        getActionConditions: function(options) {
            return this.call(Object.assign({
                endpoint: 'actions/conditions',
                method: 'GET'
            }, options));
        },

        getActionActivities: function(options) {
            return this.call(Object.assign({
                endpoint: 'actions/activities',
                method: 'GET'
            }, options));
        },

        installAction: function(action_id, install_dependencies, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install',
                method: 'POST',
                data: {
                    install_dependencies: install_dependencies
                }
            }, options));
        },

        uninstallAction: function(action_id, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install',
                method: 'DELETE'
            }, options));
        },

        updateInstalledAction: function(action_id, data, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install',
                method: 'PUT',
                data: data
            }, options));
        },

        runInstalledAction: function(action_id, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install/run',
                method: 'GET'
            }, options));
        },

        getInstalledAction: function(action_id, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install',
                method: 'GET'
            }, options));
        },

        getInstalledActionHistory: function(action_id, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install/history',
                method: 'GET'
            }, options));
        },

        getInstalledActionSetting: function(action_id, scope, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/settings/' + scope,
                method: 'GET'
            }, options));
        },

        updateInstalledActionSetting: function(action_id, scope, data, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/settings/' + scope,
                method: 'PUT',
                data: data
            }, options));
        },

        //
        // Custom Actions
        //

        createCustomAction: function(data, options) {
            return this.call(Object.assign({
                endpoint: 'custom_actions',
                method: 'POST',
                data: data
            }, options));
        },

        getCustomAction: function(action_id, options) {
            return this.call(Object.assign({
                endpoint: 'custom_actions/' + action_id,
                method: 'GET'
            }, options));
        },

        updateCustomAction: function(action_id, data, options) {
            return this.call(Object.assign({
                endpoint: 'custom_actions/' + action_id,
                method: 'PUT',
                data: data
            }, options));
        },

        //
        // Schedules
        //

        getSchedules: function(params, options) {
            return this.call(Object.assign({
                endpoint: 'schedules',
                method: 'GET',
                data: params
            }, options));
        },

        createSchedule: function(data, options) {
            return this.call(Object.assign({
                endpoint: 'schedules',
                method: 'POST',
                data: data
            }, options));
        },

        updateSchedule: function(schedule_id, data, options) {
            return this.call(Object.assign({
                endpoint: 'schedules/' + schedule_id,
                method: 'PUT',
                data: data
            }, options));
        },

        updateSchedulesStatus: function(schedule_ids, status, options) {
            return this.call(Object.assign({
                endpoint: 'schedules/status/' + status,
                method: 'PUT',
                data: {
                    schedule_ids: schedule_ids
                }
            }, options));
        },

        //
        // Events
        //

        getEvents: function(params, options) {
            return this.call(Object.assign({
                endpoint: 'events',
                method: 'GET',
                data: params
            }, options));
        },

        getEventAttendances: function(event_id, params, options) {
            return this.call(Object.assign({
                endpoint: 'events/' + event_id + '/attendances',
                method: 'GET',
                data: params
            }, options));
        },

        createEvent: function(data, options) {
            return this.call(Object.assign({
                endpoint: 'events',
                method: 'POST',
                data: data
            }, options));
        },

        updateEvent: function(event_id, data, options) {
            return this.call(Object.assign({
                endpoint: 'events/' + event_id,
                method: 'PUT',
                data: data
            }, options));
        }
    };

    return api;
});
