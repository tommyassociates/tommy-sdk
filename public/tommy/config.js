define(['cache'], function (cache) {
    var config = {
        // The current operating environment (development or production).
        // To override run `localStorage.setItem('environment', 'development')`
        environment: localStorage.getItem('environment') || 'production',

        // Set to true to disable the chat client
        disableChat: localStorage.getItem('disableChat') || false,

        getLocale: function () {
            return localStorage.getItem('locale') || 'en-US'
        },

        setLocale: function (locale) {
            localStorage.setItem('locale', locale)
        },

        getCountry: function () {
            var countryCode = localStorage.getItem('country')
            if (!countryCode) {
              if (window.location.hostname.indexOf('.cn') === -1)
                countryCode = 'en'
              else
                countryCode = 'cn'
            }
            return countryCode
        },

        setCountry: function (country) {
            localStorage.setItem('country', country)
        },

        // The base server endpoint
        getServerUrl: function () {
            if (config.isDeveloperMode()) {
                if (config.environment === 'production')
                    return 'https://sandbox-api.mytommy.com';
                else
                    return 'http://localhost:3001';
            }
            else {
                if (localStorage.getItem('serverUrl')) {
                    return localStorage.getItem('serverUrl')
                }
                else if (config.environment === 'production') {
                    var countryCode = config.getCountry();
                    // return countryCode === 'cn' ? 'https://api.tuome.com.cn' : 'https://api.mytommy.com';
                    return countryCode === 'cn' ? 'http://tommy-api-prod-mitdxzkkbk.cn-north-1.eb.amazonaws.com.cn' : 'https://api.mytommy.com';
                }
                else
                    return 'http://localhost:3000';
            }
        },

        // The full API endpoint.
        getApiUrl: function () {
            return config.getServerUrl() + '/v1/';
        },

        // The chat server endpoint.
        getChatServerUrl: function () {
            if (config.isDeveloperMode()) {
                if (config.environment === 'production')
                    return 'https://sandbox-chat.mytommy.com';
                else
                    return 'http://localhost:4500';
            }
            else {
                if (localStorage.getItem('chatServerUrl')) {
                    return localStorage.getItem('chatServerUrl')
                }
                else if (config.environment === 'production') {
                    var countryCode = config.getCountry();
                    // return countryCode === 'cn' ? 'https://chat.tuome.com.cn' : 'https://chat.mytommy.com';
                    return countryCode === 'cn' ? 'http://chat.tommy-api-prod-mitdxzkkbk.cn-north-1.eb.amazonaws.com.cn/' : 'https://chat.mytommy.com';
                }
                else
                    return 'http://localhost:4500';
            }
        },

        // isPhonegap: function () {
        //     return (typeof(cordova) !== 'undefined' || typeof(phonegap) !== 'undefined')
        // },
        //
        // // Local path for loading local files
        // getLocalPath: function (path) {
        //     // if (config.isPhonegap()) {
        //     //     return 'file://www' + path
        //     // }
        //     // else {
        //         return path
        //     // }
        // },

        getCurrentUser: function () {
            return config.getJSON('user')
        },

        getCurrentUserId: function () {
            var user = config.getCurrentUser()
            return user ? user.id : null;
        },

        getCurrentUserName: function () {
            var user = config.getCurrentUser()
            return user ? (user.first_name + ' ' + user.last_name) : null;
        },

        setCurrentUser: function (user, token) {
            config.setJSON('user', user)
            // config.setCurrentAvatar(user.icon_url)
            localStorage.setItem('token', token)
        },

        getCurrentAccount: function () {
            return config.getJSON('account')
        },

        setCurrentAccount: function (account) {
            config.setJSON('account', account)
            config.setCurrentAvatar(account.icon_url)
        },

        setCurrentTeam: function (team) {
            config.setJSON('team', team)
        },

        getCurrentTeam: function () {
            return config.getJSON('team')
        },

        getCurrentTeamId: function () {
            var team = config.getCurrentTeam()
            return team ? team.id : null;
        },

        isCurrentTeam: function () {
            return !!config.getCurrentTeam()
        },

        isCurrentAccount: function (account) {
            var current = config.getCurrentAccount()
            return (current && account && current.id == account.id && current.type == account.type)
        },

        isCurrentAccountType: function (type) {
            var account = config.getCurrentAccount()
            return (account && account.type == type)
        },

        setCurrentAvatar: function (icon) {
            localStorage.setItem('icon_url', icon)
            // var account = config.getCurrentAccount()
            // if (account) {
            //     account.icon_url = icon;
            //     config.setCurrentAccount(account)
            // }
        },

        getCurrentAvatar: function () {
            return localStorage.getItem('icon_url')
        },

        getSessionToken: function () {
            // var m = $$.parseUrlQuery(window.location.href || '')
            // return m.token || localStorage.getItem('token')
            return localStorage.getItem('token')
        },

        setDeveloperMode: function (flag, previousAccount) {
            if (flag) {
                localStorage.setItem('developer_mode', flag)

                // Store the previous account so we can restore it after
                // leaving developer mode
                if (previousAccount) {
                    if (previousAccount.developer) {
                        alert('Previous account must not be a developer account')
                        return false;
                    }
                    config.setJSON('previous_account', previousAccount)
                }
            }
            else {
                localStorage.removeItem('developer_mode')
            }
        },

        isDeveloperMode: function () {
            return !!localStorage.getItem('developer_mode')
        },

        getPreviousAccount: function () {
            return config.getJSON('previous_account')
        },

        isAuthenticated: function () {
            return !!config.getSessionToken()
        },

        onboardingComplete: function() {
            return !!localStorage.getItem('onboarding_complete')
        },

        setOnboardingComplete: function () {
            localStorage.setItem('onboarding_complete', true)
        },

        destorySession: function () {
            // localStorage.clear()
            localStorage.removeItem('token')
            localStorage.removeItem('user')
            localStorage.removeItem('team')
            localStorage.removeItem('account')
            localStorage.removeItem('previous_account')
            localStorage.removeItem('developer_mode')
        },

        setJSON: function (key, value) {
            cache.set('config', key, value) // cache it
            localStorage.setItem(key, JSON.stringify(value)) // store it
        },

        getJSON: function (key) {

            // Return cached value if available
            var value = cache.get('config', key)
            if (value)
                return value;

            // Or get stored value
            value = localStorage.getItem(key)
            try {
                value = JSON.parse(localStorage.getItem(key))
                if (value !== null) {
                    value = JSON.parse(localStorage.getItem(key))
                    cache.set('config', key, value) // cache it
                }
                return value;
            }
            catch(e) {
                localStorage.removeItem(key)
                return null;
            }
        }
    };

    return config;
})
