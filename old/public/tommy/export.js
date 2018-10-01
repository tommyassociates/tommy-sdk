define(['app','api','config','cache','util','i18n','xhr','addons','tplManager','tagSelect','Framework7'],
function(app, api,config,cache,util,i18n,xhr,addons,tplManager,tagSelect) {

    var tommy = {

      // Core
      addons: addons,
      addons: addons,
      app: app,
      api: api,
      config: config,
      cache: cache,
      util: util,
      i18n: i18n,
      xhr: xhr,
      addons: addons,

      // Utilities
      $$: Dom7,
      f7: app.f7,
      f7view: app.f7view,
      tplManager: tplManager,

      // Components
      tagSelect: tagSelect,
    }

    // Export as window global
    if (!window.tommy) window.tommy = {}
    Object.assign(window.tommy, tommy)

    return tommy;
});
