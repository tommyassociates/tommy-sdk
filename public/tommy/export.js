define(['addons','app','api','util','config','cache','i18n','xhr','tplManager','tagSelect','Framework7'],
function(addons,app, api,util,config,cache,i18n,xhr,tplManager,tagSelect) {

    // KLUDGE: Export as global for temporary ES6 integration
    if (!window.tommy) window.tommy = {}

    // Core
    window.tommy.addons = addons
    window.tommy.app = app
    window.tommy.api = api
    window.tommy.cache = cache
    window.tommy.config = config
    window.tommy.i18n = i18n
    window.tommy.util = util
    window.tommy.xhr = xhr

    // Utilities
    window.$$ = Dom7
    window.tommy.f7 = app.f7
    window.tommy.f7view = app.f7view
    window.tommy.tplManager = tplManager

    // Components
    window.tommy.tagSelect = tagSelect

    return {};
});
