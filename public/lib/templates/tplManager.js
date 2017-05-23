define(['config','Framework7'],
function (config) {
    var $$ = Dom7;
    var t7 = Template7;

    var tplManager = {
        load: function (tid) {
            return $$('#' + tid).html();
        },

        // Storage for compiled templates
        cache: {},

        compile: function (markup, context) {
            var compiledTemplate = t7.compile(markup);
            var output = compiledTemplate(context);
            return output;
        },

        loadAndCompile: function (tid, context) {
            if (this.cache[tid])
              return this.cache[tid];
            var markup = this.load(tid);
            return this.cache[tid] = t7.compile(markup);
            // return $$('#' + tid).html();
            // return
            // var compiledTemplate = t7.compile(markup);
            // var output = compiledTemplate(context);
            // return output;
        },

        render: function (tid, context) {
            // var markup = this.load(tid);
            // console.log('render', tid, markup)
            return this.loadAndCompile(tid)(context);
        },

        renderTarget: function (tid, context, target) {
            var output = this.render(tid, context);
            return $$(target).html(output);
        },

        renderInline: function (tid, context, scope) {
            var output = this.render(tid, context);
            if (scope) {
                return $$(scope).find('[data-template="' + tid + '"]').html(output);
            }
            else {
                return $$('[data-template="' + tid + '"]').html(output);
            }
        },

        // renderRemote: function (tplName, context, callback) {
        //     tplName = tplName || '';
        //     $$.get('views/' + tplName + '.tpl.html', function (markup) {
        //         var compiledTemplate = t7.compile(markup);
        //         var output = compiledTemplate(context);
        //
        //         typeof(callback === 'function') ? callback(output) : null;
        //     });
        // },

        initGlobalVariables: function () {
            if (!t7.global)
                t7.global = {};
            t7.global.user = config.getCurrentUser();
            t7.global.team = config.getCurrentTeam();
            t7.global.account = config.getCurrentAccount();
            t7.global.developerMode = config.isDeveloperMode();
            t7.global.serverUrl = config.getServerUrl();
            t7.global.apiUrl = config.getApiUrl();
            t7.global.token = config.getSessionToken();
        }
    };

    // tplManager.init();

    return tplManager;
});
