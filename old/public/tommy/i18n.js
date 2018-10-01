define(['i18next'],
function(i18next) {

    var i18n = {
        i18next: null,

        init: function(options, callback) {
            i18n.i18next = i18next; // require('i18next')
            i18n.i18next.use(i18n.backend).init(options, callback)
        },

        // A collection of endpoints with translation files to load
        // Each endpoint should define translations for a different namespace
        endpoints: {},

        t: function(key, options) {

            // Translate the addon namespace and fallback to default
            // namespace if translation is unavailable
            var keys = []
            if (Template7 &&
                Template7.global &&
                Template7.global.currentAddonInstall &&
                Template7.global.currentAddonInstall.package)
                keys.push(Template7.global.currentAddonInstall.package + ':' + key)

            // Add global addons here ie. wallet
            keys.push('wallet:' + key)
            keys.push(key)

            return i18n.i18next.t(keys, options)
        },

        // Add an endpoint for a namespace
        addNamespaceEndpoint: function(namespace, endpoint, languages, loadNow) {
            if (!namespace)
                namespace = 'translation' // default namespace

            if (i18n.endpoints[namespace]) {
                // alert('Translation namespace already added for ' + namespace)
                return;
            }
            i18n.endpoints[namespace] = {
                endpoint: endpoint,
                languages: languages // TODO: ensure exists before loading
            }

            console.log('added namespace endpoint', namespace, endpoint, languages, loadNow)
            if (loadNow) {
                return i18n.loadNamespaceTranslations(namespace)
            }
        },

        // Load translations from the endpoint for the given namespace
        loadNamespaceTranslations: function(namespace, language) {
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
                promises.push(i18n.loadNamespaceTranslations(namespace, language)) //, endpoint
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
