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
        },

        reset: function (scope, partialKey) {
            if (scope && partialKey) {
                for (var key in this.data) {
                    if (key.indexOf(partialKey) !== -1) {
                        this.data[scope][key] = {};
                    }
                }
            }
            else if (scope)
                this.data[scope] = {};
            else
                this.data = {};
        }
    };

    return cache;
});
