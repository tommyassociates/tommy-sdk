define(['app','config','i18next'],
function(app,config,i18next) {

    var i18n = {
        i18next: null,

        init: function(options, callback) {
            this.i18next = i18next; // require('i18next')
            this.i18next.use(i18n.backend).init(options, callback)
        },

        // A collection of endpoints with translation files to load
        // Each endpoint should define translations for a different namespace
        endpoints: {},

        // Add an endpoint for a namespace
        addEndpoint: function(namespace, endpoint, languages, loadNow) {
            if (!namespace)
                namespace = 'translation' // default namespace

            if (i18n.endpoints[namespace]) {
                alert('Translation namespace already added for ' + namespace)
                return;
            }
            i18n.endpoints[namespace] = {
                endpoint: endpoint,
                languages: languages // TODO: ensure exists before loading
            }
            if (loadNow) {
                return i18n.loadTranslations(namespace)
            }
        },

        // Load translations from the endpoint for the given namespace
        loadTranslations: function(namespace, language) {
            return new Promise(function(resolve, reject) {
                if (!language) language = i18next.language
                var context = i18n.endpoints[namespace]
                var endpoint = context.endpoint
                var url = endpoint + '/' + language + '.json'

                // Dom7 is providing annoying double callbacks, so keep a
                // `responded` flag so we don't trigger callbacks twice
                var responded = false
                Dom7.getJSON(url, function(resources) {
                    console.log('loaded translation', language, endpoint, resources)
                    i18n.i18next.addResourceBundle(language, namespace, resources)
                    resolve(null, resources)
                    responded = true
                }, function(xhr, status) {
                    if (!responded) {
                        console.log('failed to load translation: ' + status, language, url)
                        reject('Failed to load translation for ' + namespace + ': ' + status)
                    }
                })
            })
        },

        // Load all translations available for the given language
        loadLanguage: function(language) {
            console.log('loading language translations: ' + language)

            var promises = []
            for (var namespace in i18n.endpoints) {
                var endpoint = i18n.endpoints[namespace].endpoint
                promises.push(i18n.loadTranslations(namespace, language)) //, endpoint
            }
            return Promise.all(promises)
        },

        backend: {
            type: 'backend',

            init: function(services, backendOptions, i18nextOptions) {
                console.log('init translations', services, backendOptions, i18nextOptions)
            },

            read: function(language, namespace, callback) {
                console.log('loading translation', language, namespace)
                if (language === 'dev') {
                    callback(null, {})
                    return;
                }

                // NOTE: Use `i18next.language` rather than language as it contains
                // the full language string ie. `zh-CN` rather than just `zh`.
                i18n.loadLanguage(i18next.language).then(callback)
            }
        }
    };

    return i18n;
})
