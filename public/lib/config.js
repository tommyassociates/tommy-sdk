define(['cache'], function (cache) {
    var config = {
        // The current operating environment (development or production).
        // To override run `localStorage.setItem('environment', 'development')`
        environment: localStorage.getItem('environment') || 'production',

        // Set to true to disable the chat client
        disableChat: localStorage.getItem('disableChat') || false,

        // The base server endpoint
        getServerUrl: function () {
            if (this.isDeveloperMode()) {
                if (this.environment === 'production')
                    return 'https://sandbox-api.mytommy.com/';
                else
                    return 'http://localhost:3001/';
            }
            else {
                if (this.environment === 'production')
                    return 'https://api.mytommy.com/';
                else
                    return 'http://localhost:3000/';
            }
        },

        // The full API endpoint.
        getApiUrl: function () {
            return this.getServerUrl() + 'v1/';
        },

        // The chat server endpoint.
        getChatServerUrl: function () {
            if (this.isDeveloperMode()) {
                if (this.environment === 'production')
                    return 'https://sandbox-chat.mytommy.com';
                else
                    return 'http://localhost:4500';
            }
            else {
                if (this.environment === 'production')
                    return 'https://chat.mytommy.com';
                else
                    return 'http://localhost:4500';
            }
        },

        getCurrentUser: function () {
            return this.getJSON('user');
        },

        getCurrentUserId: function () {
            var user = this.getCurrentUser();
            return user ? user.id : null;
        },

        setCurrentUser: function (user, token) {
            this.setJSON('user', user);
            // this.setCurrentAvatar(user.icon_url);
            localStorage.setItem('token', token);
        },

        getCurrentAccount: function () {
            return this.getJSON('account');
        },

        setCurrentAccount: function (account) {
            this.setJSON('account', account);
            this.setCurrentAvatar(account.icon_url);
        },

        setCurrentTeam: function (team) {
            this.setJSON('team', team);
        },

        getCurrentTeam: function () {
            return this.getJSON('team');
        },

        getCurrentTeamId: function () {
            var team = this.getCurrentTeam();
            return team ? team.id : null;
        },

        isCurrentTeam: function () {
            return !!this.getCurrentTeam();
        },

        isCurrentAccount: function (account) {
            var current = this.getCurrentAccount();
            return (current && account && current.id == account.id && current.type == account.type);
        },

        isCurrentAccountType: function (type) {
            var account = this.getCurrentAccount();
            return (account && account.type == type);
        },

        setCurrentAvatar: function (icon) {
            localStorage.setItem('icon_url', icon);
            // var account = this.getCurrentAccount();
            // if (account) {
            //     account.icon_url = icon;
            //     this.setCurrentAccount(account);
            // }
        },

        getCurrentAvatar: function () {
            return localStorage.getItem('icon_url');
        },

        getSessionToken: function () {
            // var m = $$.parseUrlQuery(window.location.href || '');
            // return m.token || localStorage.getItem('token');
            return localStorage.getItem('token');
        },

        setDeveloperMode: function (flag, previousAccount) {
            if (flag) {
                localStorage.setItem('developer_mode', flag);

                // Store the previous account so we can restore it after
                // leaving developer mode
                if (previousAccount) {
                    if (previousAccount.developer) {
                        alert('Previous account must not be a developer account');
                        return false;
                    }
                    this.setJSON('previous_account', previousAccount);
                }
            }
            else {
                localStorage.removeItem('developer_mode');
            }
        },

        isDeveloperMode: function () {
            return !!localStorage.getItem('developer_mode');
        },

        getPreviousAccount: function () {
            return this.getJSON('previous_account');
        },

        isAuthenticated: function () {
            return !!this.getSessionToken();
        },

        onboardingComplete: function() {
            return !!localStorage.getItem('onboarding_complete');
        },

        setOnboardingComplete: function () {
            localStorage.setItem('onboarding_complete', true);
        },

        destorySession: function () {
            // localStorage.clear();
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('team');
            localStorage.removeItem('account');
            localStorage.removeItem('previous_account');
            localStorage.removeItem('developer_mode');
        },

        setJSON: function (key, value) {
            cache.set('config', key, value); // cache it
            localStorage.setItem(key, JSON.stringify(value)); // store it
        },

        getJSON: function (key) {

            // Return cached value if available
            var value = cache.get('config', key);
            if (value)
                return value;

            // Or get stored value
            value = localStorage.getItem(key);
            try {
                value = JSON.parse(localStorage.getItem(key));
                if (value !== null) {
                    value = JSON.parse(localStorage.getItem(key));
                    cache.set('config', key, value); // cache it
                }
                return value;
            }
            catch(e) {
                localStorage.removeItem(key);
                return null;
            }
        }
    };

    return config;
});
