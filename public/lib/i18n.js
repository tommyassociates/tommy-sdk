define(function (require) {
  
    var i18n = {
        i18next: null,

        init: function(options, callback) {
            this.i18next = require('i18next');
            this.i18next.use(i18n.backend).init(options, callback);
        },

        backend: {
            type: 'backend',
            init: function(services, backendOptions, i18nextOptions) { },
            read: function(language, namespace, callback) {
                console.log('Loading translation', language, namespace)
                if (language == 'dev') {
                    callback(null, {});
                    return;
                }

                Dom7.getJSON('/locales/' + language + '.json', function(data) {
                    console.log('Load translation', language, namespace, data)
                    callback(null, data);
                });
            },

            // optional
            readMulti: function(languages, namespaces, callback) { },
            create: function(languages, namespace, key, fallbackValue) { }
        }
    };
    //i18n.init();

    return i18n; //i18n; // 
});