define([], function() {

    var cache = {
        data: {},

        get: function (scope, key) {
            if (!scope || !this.data[scope])
                return null;
            return key ? this.data[scope][key] : this.data[scope];
        },

        set: function (scope, key, value) {
            if (typeof this.data[scope] === 'undefined')
                this.data[scope] = {};
            this.data[scope][key] = value;
        }
    };

    return cache;
});
