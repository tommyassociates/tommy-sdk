define(['xhr','config','cache','util'], function(xhr,config,cache,util) {

    var api = {
        call: function(options) {
            return new Promise(function(resolve, reject) {

                // Get the cached object if available
                if (typeof options.cache === 'undefined' && options.method == 'GET' && options.endpoint)
                    options.cache = true

                if (options.cache) {
                    if (!options.cacheKey)
                        options.cacheKey = options.endpoint + JSON.stringify(options.data)
                    var cachedResponse = cache.get('api', options.cacheKey)
                    if (cachedResponse) {
                        console.log('[READ CACHE] api response', options.endpoint, cachedResponse)
                        resolve(cachedResponse)
                        return
                    }
                }

                // Set the request URL
                options.url = options.url || config.getApiUrl() // api.url
                if (options.endpoint)
                    options.url += options.endpoint

                if (!options.data)
                    options.data = {}

                // Set the current addon for the request
                if (Template7 &&
                    Template7.global &&
                    Template7.global.currentAddonInstall &&
                    Template7.global.currentAddonInstall.package) {
                    options.data['addon'] = Template7.global.currentAddonInstall.package

                    // Set the Actor ID for managed calls
                    if (Template7.global.currentActorId)
                        options.data['actor_id'] = Template7.global.currentActorId
                }

                // Set the locale
                if (!options.locale)
                    options.data['locale'] = config.getLocale()

                // Make the XHR request
                // console.log('api: request', options)
                return xhr.call(options, function(response) {
                    // console.log('api: response', data.func, response)

                    // Set the object in the config `localStore` if requested
                    if (options.configKey) {
                        config.setJSON(options.configKey, response)
                    }

                    // Cache the value for next time
                    if (options.cache && options.cacheKey) { // && cacheKey
                        cache.set('api', options.cacheKey, response)
                        console.log('[SET CACHE] api response', options.endpoint, response)
                    }
                    resolve(response)
                }, reject)
            })
        },

        resetCache: function(partialKey) {
            cache.reset('api', partialKey)
        },

        login: function(emailOrPhone, password, options) {
            this.resetCache()
            return this.call(Object.assign({
                endpoint: 'sessions',
                method: 'POST',
                data: {
                    login: emailOrPhone,
                    password: password
                }
            }, options))
        },

        resetPassword: function(login, options) {
            return this.call(Object.assign({
                endpoint: 'users/reset_password',
                method: 'POST',
                data: {
                    login: login
                }
            }, options))
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
            }, options))
        },

        unregisterDevice: function(token, options) {
            return this.call(Object.assign({
                endpoint: 'devices/' + token,
                method: 'DELETE'
            }, options))
        },

        createUser: function(data, options) {
            return this.call(Object.assign({
                endpoint: 'users',
                method: 'POST',
                data: data
            }, options))
        },

        updateUser: function(user_id, data, options) {
            return this.call(Object.assign({
                endpoint: 'users/' + user_id,
                method: 'PUT',
                data: data
            }, options))
        },

        sendConfirmationSms: function(user_id, data, options) {
            return this.call(Object.assign({
                endpoint: 'users/' + user_id + '/send_verification_sms',
                method: 'POST',
                data: data
            }, options))
        },

        sendConfirmationEmail: function(user_id, data, options) {
            return this.call(Object.assign({
                endpoint: 'users/' + user_id + '/send_verification_email',
                method: 'POST',
                data: data
            }, options))
        },

        checkConfirmationCode: function(pin, data, options) {
            return this.call(Object.assign({
                endpoint: 'users/verify/' + pin,
                method: 'GET',
                data: data
            }, options))
        },

        getAccounts: function(options) {
            return this.call(Object.assign({
                endpoint: 'me/accounts',
                method: 'GET'
            }, options))
        },

        searchAccounts: function(term) {
            return this.call(Object.assign({
                endpoint: 'accounts/search/' + term,
                method: 'GET'
            }))
        },

        getAssociates: function(options) {
            return this.call(Object.assign({
                endpoint: 'me/associates',
                method: 'GET'
            }, options))
        },

        getCurrentUser: function(options) {
            return this.call(Object.assign({
                endpoint: 'me',
                method: 'GET'
            }, options))
        },

        updateCurrentUser: function(data, options) {
            this.resetCache('me')
            return this.call(Object.assign({
                endpoint: 'me',
                method: 'PUT',
                data: data
            }, options))
        },

        getCurrentAccount: function(options) {
            return this.call(Object.assign({
                endpoint: 'me/current_account',
                method: 'GET'
            }, options))
        },

        getCurrentUserSettings: function(options) {
            return this.call(Object.assign({
                endpoint: 'me/settings',
                method: 'GET'
            }, options))
        },

        updateCurrentUserSetting: function(key, value, options) {
            this.resetCache('me/settings')
            return this.call(Object.assign({
                endpoint: 'me/settings/' + key,
                method: 'PUT',
                data: {
                    data: value
                }
            }, options))
        },

        getCurrentTeam: function(options) {
            // this.resetCache('team')
            return this.call(Object.assign({
                endpoint: 'team',
                method: 'GET'
            }, options))
        },

        // deprecated
        // getCurrentTeamWithCache: function(options) {
        //     var currentTeam = config.getCurrentTeam()
        //     if (currentTeam && typeof(success) === 'function')
        //         success(currentTeam)
        //     this.getCurrentTeam().then(function(response) {
        //         config.setCurrentTeam(response)
        //         if (typeof(success) === 'function')
        //             success(response)
        //     }) //, error, showLoader
        // },

        getCurrentTeamTags: function(options) {
            return this.call(Object.assign({
                endpoint: 'team/tags',
                method: 'GET',
                // cache: cache
            }, options))
        },

        getCurrentTeamMembers: function(options) {
            return this.call(Object.assign({
                endpoint: 'team/members',
                method: 'GET'
            }, options))
        },

        getCurrentTeamMember: function(user_id, options) {
            return this.call(Object.assign({
                endpoint: 'team/members/' + user_id,
                method: 'GET',
                data: {
                    with_addon_links: true
                }
            }, options))
        },

        updateCurrentTeamMember: function(user_id, data, options) {
            this.resetCache('team/members')
            return this.call(Object.assign({
                endpoint: 'team/members/' + user_id,
                method: 'PUT',
                data: data
            }, options))
        },

        inviteTeamMember: function(data, options) {
            return this.call(Object.assign({
                endpoint: 'team/members/invite',
                method: 'POST',
                data: data
            }, options))
        },

        createTeam: function(data, options) {
            return this.call(Object.assign({
                endpoint: 'teams',
                method: 'POST',
                data: data
            }, options))
        },

        updateTeam: function(team_id, data, options) {
            this.resetCache('teams')
            return this.call(Object.assign({
                endpoint: 'teams/' + team_id,
                method: 'PUT',
                data: data
            }, options))
        },

        updateCurrentTeam: function(data, options) {
            this.resetCache('teams')
            return this.call(Object.assign({
                endpoint: 'team',
                method: 'PUT',
                data: data
            }, options))
        },

        updateCurrentAccount: function(account_id, account_type, location_id, options) {
            this.resetCache('user')
            return this.call(Object.assign({
                endpoint: 'me/current_account',
                method: 'PUT',
                data: {
                    current_account_id: account_id,
                    current_account_type: account_type,
                    current_location_id: location_id
                }
            }, options))
        },

        getInvitations: function(options) {
            return this.call(Object.assign({
                endpoint: 'invitations',
                method: 'GET'
            }, options))
        },

        createInvitationLink: function(options) {
            return this.call(Object.assign({
                endpoint: 'invitations',
                method: 'POST'
            }, options))
        },

        getContacts: function(options) {
            return this.call(Object.assign({
                endpoint: 'contacts',
                method: 'GET',
                // data: {
                //     team_id: config.getCurrentTeamId()
                // }
            }, options))
        },

        createContact: function(data, options) {
            return this.call(Object.assign({
                endpoint: 'contacts',
                method: 'POST',
                data: data
            }, options))
        },

        addContact: function(friend_id, data, options) {
            return this.call(Object.assign({
                endpoint: 'contacts/' + friend_id + '/add',
                method: 'POST',
                data: data
            }, options))
        },

        acceptContactRequest: function(friend_id, team_ids, options) {
            return this.call(Object.assign({
                endpoint: 'contacts/' + friend_id + '/accept',
                method: 'POST',
                data: {
                    team_ids: team_ids
                }
            }, options))
        },

        declineContactRequest: function(friend_id, options) {
            return this.call(Object.assign({
                endpoint: 'contacts/' + friend_id + '/decline',
                method: 'POST'
            }, options))
        },

        getContactRequests: function(options) {
            return this.call(Object.assign({
                endpoint: 'contacts/requests',
                method: 'GET',
                data: {
                    team_id: config.getCurrentTeamId()
                }
            }, options))
        },

        importContacts: function(data, options) {
            this.resetCache('contacts')
            return this.call(Object.assign({
                endpoint: 'contacts/import',
                method: 'POST',
                data: data
            }, options))
        },

        getContact: function(user_id, options) {
            return this.call(Object.assign({
                endpoint: 'contacts/' + user_id,
                method: 'GET'
            }, options))
        },

        updateContact: function(user_id, data, options) {
            this.resetCache('contacts')
            return this.call(Object.assign({
                endpoint: 'contacts/' + user_id,
                method: 'PUT',
                data: data
            }, options))
        },

        getChat: function(chat_id, options) {
            return this.call(Object.assign({
                endpoint: 'chats/' + chat_id,
                method: 'GET',
                data: {
                    with_users: true
                }
            }, options))
        },

        updateChat: function(chat_id, data, options) {
            return this.call(Object.assign({
                endpoint: 'chats/' + chat_id,
                method: 'PUT',
                data: data
            }, options))
        },

        createChat: function(user_ids, options) {
            this.resetCache('chats')
            return this.call(Object.assign({
                endpoint: 'chats',
                method: 'POST',
                data : { user_ids: user_ids }
            }, options))
        },

        deleteChat: function(chat_id, options) {
            this.resetCache('chats')
            return this.call(Object.assign({
                endpoint: 'chats/' + chat_id,
                method: 'DELETE',
            }, options))
        },

        initiateChat: function(user_ids, options) {
            this.resetCache('chats')
            return this.call(Object.assign({
                endpoint: 'chats/initiate',
                method: 'POST',
                data : { user_ids: user_ids }
            }, options))
        },

        getChatMessages: function(chat_id, options) {
            return this.call(Object.assign({
                endpoint: 'chats/' + chat_id + '/messages',
                method: 'GET'
            }, options))
        },

        getChatUsers: function(chat_id, options) {
            return this.call(Object.assign({
                endpoint: 'chats/' + chat_id + '/users',
                method: 'GET'
            }, options))
        },

        createChatUser: function(chat_id, user_id, options) {
            this.resetCache('chats/' + chat_id)
            return this.call(Object.assign({
                endpoint: 'chats/' + chat_id + '/users',
                method: 'POST',
                data: {
                    user_id: user_id
                }
            }, options))
        },

        deleteChatUser: function(chat_id, user_id, options) {
            this.resetCache('chats/' + chat_id)
            return this.call(Object.assign({
                endpoint: 'chats/' + chat_id + '/users/' + user_id,
                method: 'DELETE'
            }, options))
        },

        getRecentChatMessages: function(options) {
            return this.call(Object.assign({
                endpoint: 'messages/recent',
                method: 'GET'
            }, options))
        },

        getFavoriteChatMessages: function(options) {
            return this.call(Object.assign({
                endpoint: 'messages/favorite',
                method: 'GET'
            }, options))
        },

        sendMessage: function(chat_id, body, send_at, via, options) {
            this.resetCache('messages')
            return this.call(Object.assign({
                endpoint: 'messages',
                method: 'POST',
                data: {
                    chat_id: chat_id,
                    body: body,
                    send_at: send_at,
                    via: via
                }
            }, options))
        },

        deleteMessage: function(message_id, options) {
            this.resetCache('messages')
            return this.call(Object.assign({
                endpoint: 'messages/' + message_id,
                method: 'DELETE'
            }, options))
        },

        sendDirectMessage: function(receiver_ids, message, send_at, via, options) {
            this.resetCache('messages')
            return this.call(Object.assign({
                endpoint: 'messages',
                method: 'POST',
                data: {
                    message: message,
                    receiver_ids: receiver_ids,
                    send_at: send_at,
                    via: via
                }
            }, options))
        },

        //
        // Addons
        //

        getAddons: function(options) {
            return this.call(Object.assign({
                endpoint: 'addons',
                method: 'GET'
            }, options))
        },

        getInstalledAddons: function(options) {
            return this.call(Object.assign({
                endpoint: 'addons/installed',
                method: 'GET'
            }, options))
        },

        getRecommendedAddons: function(options) {
            return this.call(Object.assign({
                endpoint: 'addons/recommended',
                method: 'GET'
            }, options))
        },

        getAddon: function(package, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package,
                method: 'GET'
            }, options))
        },

        getAddonVersion: function(package, version, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/versions/' + version,
                method: 'GET'
            }, options))
        },

        deleteAddonVersion: function(package, version, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/versions/' + version,
                method: 'DELETE'
            }, options))
        },

        getAddonFile: function(package, version, fileName, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/versions/' + version + '/files/' + fileName,
                method: 'GET'
            }, options))
        },

        installAddon: function(package, params, options) {
            this.resetCache('addons')
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/install',
                method: 'POST',
                data: params
            }, options))
        },

        uninstallAddon: function(package, options) {
            this.resetCache('addons')
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/install',
                method: 'DELETE'
            }, options))
        },

        getInstalledAddonSetting: function(package, name, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/install/settings/' + name,
                method: 'GET'
            }, options))
        },

        updateInstalledAddonSetting: function(package, name, data, options) {
            this.resetCache('addons/' + package)
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/install/settings/' + name,
                method: 'PUT',
                data: data
            }, options))
        },

        getInstalledAddonPermissions: function(package, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/install/permissions',
                method: 'GET',
                data: {
                    with_filters: true
                }
            }, options))
        },

        getInstalledAddonPermission: function(package, name, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/install/permissions/' + name,
                method: 'GET',
                data: {
                    with_filters: true
                }
            }, options))
        },

        getInstalledAddonPremissionFilters: function(package, name, options) {
            return this.call(Object.assign({
                endpoint: 'addons/' + action_id + '/install/permissions/' + name + '/filters',
                method: 'GET'
            }, options))
        },

        updateInstalledAddonPermission: function(package, name, data, options) {
            this.resetCache('addons/' + package)
            return this.call(Object.assign({
                endpoint: 'addons/' + package + '/install/permissions/' + name,
                method: 'PUT',
                data: data
            }, options))
        },

        //
        // Actions
        //

        getActions: function(options) {
            return this.call(Object.assign({
                endpoint: 'actions',
                method: 'GET'
            }, options))
        },

        getAction: function(action_id, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id,
                method: 'GET'
            }, options))
        },

        getActionVariableList: function(action_id, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/variables',
                method: 'GET'
            }, options))
        },

        getInstalledActions: function(options) {
            return this.call(Object.assign({
                endpoint: 'actions/installed',
                method: 'GET'
            }, options))
        },

        getRecentActions: function(options) {
            return this.call(Object.assign({
                endpoint: 'actions/recent',
                method: 'GET'
            }, options))
        },

        getActionTasks: function(options) {
            return this.call(Object.assign({
                endpoint: 'actions/tasks',
                method: 'GET'
            }, options))
        },

        getActionTriggers: function(options) {
            return this.call(Object.assign({
                endpoint: 'actions/triggers',
                method: 'GET'
            }, options))
        },

        getActionConditions: function(options) {
            return this.call(Object.assign({
                endpoint: 'actions/conditions',
                method: 'GET'
            }, options))
        },

        getActionActivities: function(options) {
            return this.call(Object.assign({
                endpoint: 'actions/activities',
                method: 'GET'
            }, options))
        },

        installAction: function(action_id, install_dependencies, options) {
            this.resetCache('actions')
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install',
                method: 'POST',
                data: {
                    install_dependencies: install_dependencies
                }
            }, options))
        },

        uninstallAction: function(action_id, options) {
            this.resetCache('actions')
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install',
                method: 'DELETE'
            }, options))
        },

        updateInstalledAction: function(action_id, data, options) {
            this.resetCache('actions')
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install',
                method: 'PUT',
                data: data
            }, options))
        },

        runInstalledAction: function(action_id, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install/run',
                method: 'GET'
            }, options))
        },

        getInstalledAction: function(action_id, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install',
                method: 'GET'
            }, options))
        },

        getInstalledActionHistory: function(action_id, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install/history',
                method: 'GET'
            }, options))
        },

        getInstalledActionSetting: function(action_id, scope, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install/settings/' + scope,
                method: 'GET'
            }, options))
        },

        updateInstalledActionSetting: function(action_id, scope, data, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install/settings/' + scope,
                method: 'PUT',
                data: data
            }, options))
        },

        getInstalledActionPremissions: function(action_id, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install/permissions',
                method: 'GET',
                data: {
                    with_filters: true
                }
            }, options))
        },

        getInstalledActionPremission: function(action_id, name, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install/permissions/' + name,
                method: 'GET',
                data: {
                    with_filters: true
                }
            }, options))
        },

        getInstalledActionPremissionFilters: function(action_id, name, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install/permissions/' + name + '/filters',
                method: 'GET'
            }, options))
        },

        updateInstalledActionPremission: function(action_id, name, data, options) {
            return this.call(Object.assign({
                endpoint: 'actions/' + action_id + '/install/permissions/' + name,
                method: 'PUT',
                data: data
            }, options))
        },

        //
        // Custom Actions
        //

        createCustomAction: function(data, options) {
            this.resetCache('actions')
            return this.call(Object.assign({
                endpoint: 'custom_actions',
                method: 'POST',
                data: data
            }, options))
        },

        getCustomAction: function(action_id, options) {
            return this.call(Object.assign({
                endpoint: 'custom_actions/' + action_id,
                method: 'GET'
            }, options))
        },

        updateCustomAction: function(action_id, data, options) {
            this.resetCache('actions')
            return this.call(Object.assign({
                endpoint: 'custom_actions/' + action_id,
                method: 'PUT',
                data: data
            }, options))
        },

        deleteCustomAction: function(action_id, options) {
            this.resetCache('actions')
            return this.call(Object.assign({
                endpoint: 'custom_actions/' + action_id,
                method: 'DELETE'
            }, options))
        },

        //
        // Schedules
        //

        getSchedules: function(params, options) {
            return this.call(Object.assign({
                endpoint: 'schedules',
                method: 'GET',
                data: params
            }, options))
        },

        createSchedule: function(data, options) {
            return this.call(Object.assign({
                endpoint: 'schedules',
                method: 'POST',
                data: data
            }, options))
        },

        updateSchedule: function(schedule_id, data, options) {
            return this.call(Object.assign({
                endpoint: 'schedules/' + schedule_id,
                method: 'PUT',
                data: data
            }, options))
        },

        updateSchedulesStatus: function(schedule_ids, status, options) {
            return this.call(Object.assign({
                endpoint: 'schedules/status/' + status,
                method: 'PUT',
                data: {
                    schedule_ids: schedule_ids
                }
            }, options))
        },

        //
        // Events
        //

        getEvents: function(params, options) {
            return this.call(Object.assign({
                endpoint: 'events',
                method: 'GET',
                data: params
            }, options))
        },

        getEventAttendances: function(event_id, params, options) {
            return this.call(Object.assign({
                endpoint: 'events/' + event_id + '/attendances',
                method: 'GET',
                data: params
            }, options))
        },

        createEvent: function(data, options) {
            this.resetCache('events')
            return this.call(Object.assign({
                endpoint: 'events',
                method: 'POST',
                data: data
            }, options))
        },

        updateEvent: function(event_id, data, options) {
            this.resetCache('events')
            return this.call(Object.assign({
                endpoint: 'events/' + event_id,
                method: 'PUT',
                data: data
            }, options))
        },

        deleteEvent: function(event_id, options) {
            return this.call(Object.assign({
                endpoint: 'events/' + event_id,
                method: 'DELETE'
            }, options))
        },

        //
        // Fragments
        //

        getFragments: function(params, options) {
            return this.call(Object.assign({
                endpoint: 'fragments',
                method: 'GET',
                data: params
            }, options))
        },

        createFragment: function(data, options) {
            return this.call(Object.assign({
                endpoint: 'fragments',
                method: 'POST',
                data: data
            }, options))
        },

        updateFragment: function(fragment_id, data, options) {
            this.resetCache('fragments')
            return this.call(Object.assign({
                endpoint: 'fragments/' + fragment_id,
                method: 'PUT',
                data: data
            }, options))
        },

        deleteFragment: function(fragment_id, options) {
            return this.call(Object.assign({
                endpoint: 'fragments/' + fragment_id,
                method: 'DELETE'
            }, options))
        }
    }

    return api
})
