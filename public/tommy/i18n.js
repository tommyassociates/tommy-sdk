define(['app','config','i18next'],
function(app,config,i18next) {

    var i18n = {
        i18next: null,

        init: function(options, callback) {
            this.i18next = i18next; //require('i18next')
            this.i18next.use(i18n.backend).init(options, callback)
        },

        backend: {
            type: 'backend',
            init: function(services, backendOptions, i18nextOptions) {
                console.log('Init translations', services, backendOptions, i18nextOptions)
            },
            read: function(language, namespace, callback) {
                console.log('Loading translation', language, namespace)
                if (language == 'dev') {
                    callback(null, {})
                    return;
                }

                Dom7.getJSON('locales/' + language + '.json', function(data) {
                    console.log('Load translation', language, namespace, data)
                    callback(null, data)
                }, function(xhr, status) {
                    console.log('Load translation error: ' + status)
                })
            },

            // optional
            readMulti: function(languages, namespaces, callback) { },
            create: function(languages, namespace, key, fallbackValue) { }
        }
    };

    // KLUDGE: Export as global for ES6 integration
    if (!window.tommy) window.tommy = {}
    window.tommy.i18n = i18n

    return i18n;
})
