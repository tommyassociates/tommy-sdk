/** Class: Tommy.Addons
 *  Create a Tommy.Addons object.
 */

Tommy.Addons = function() {
    this.bind();
};

Tommy.Addons.prototype = {

    /**
     *  Object containing all addon objects scoped by package name and version.
     */

    addons: {},

    /**
     *  Object containing all addon view objects scoped by package view name.
     */

    views: {},

    /**
     *  Bind the addons interface.
     */

    bind: function() {
        T.env.f7App.onPageInit('*', this.renderView) //AfterAnimation
    },

    renderView: function(f7page) {
        var $page = $$(f7page.container),
            package = $page.data('addon'),
            viewId = $page.data('view'),
            view = T.addons.getView(package, viewId);
        // T.addons.views[$page.data('addon') + '-' + $page.data('view')];
        // package = $page.data('addon'),
        // view = $page.data('view'),

        if (view && !view.initialized) {
            view.initialized = true;

            var manifest = T.addons.get(package, 'manifest');

            console.log('render addon view page', f7page.name, view);

            // Inject content for framed views
            if (view.framed) {
                var $iframe = $page.find('.page-content > iframe:first');
                $iframe.ready(function() {
                    $iframe.contents().find('body').append(view.data);
                });
            }

            // // Bind addon configuration forms
            // if (view.type == 'form') {
            //     $page.find('input, select, textarea').change(function() {
            //         // console.log('input change');
            //         var $e = $$(this);
            //         if (!$e.val() || !$e.attr('name')) {
            //             console.log('skipping invalid input');
            //             return;
            //         }
            //         T.api.create('/settings', {
            //             name: 'addons:' + view.package + ':' + $e.attr('name'),
            //             value: $e.val()
            //         }, function(err, res) {
            //             console.log('created setting', err, res);
            //         });
            //     });
            // }

            // Move addon page elements to global scope
            $$('body').append($page.find('.popup'));

            // Evaluate queued JavaScripts after animation completes
            // T.addons.evalPageJavaScript(view);
            if (view.assets && view.assets.length) {
                for (var i = 0; i < view.assets.length; i++) {
                    var asset = view.assets[i];
                    if (asset.type == 'javascript') {
                        var script = document.createElement('script');
                        script.type = 'text/javascript';
                        script.src = T.addons.filePath(package, manifest.version, asset.file);
                        document.body.appendChild(script);
                    } else if (asset.type == 'stylesheet') {
                        var style = document.createElement('link');
                        style.rel = 'stylesheet';
                        style.href = T.addons.filePath(package, manifest.version, asset.file);
                        document.body.appendChild(style);
                        // <link rel="stylesheet" href="{{@global.addons.calendar.path}}views/main.css">


                    }
                        // $$('body').append($page.find('.popup'));

                }
            }
        }
    },

    getView: function(package, viewId) {
        return this.views[package + '-' + viewId];
    },

    showView: function(package, viewId) {
        var view = this.getView(package, viewId);
        if (!view)
            throw 'Unknown view for ' + package + ' and ' + viewId;

        T.env.f7View.router.loadContent(view.html);

        // var view = this.views[viewId],
        //   manifest = this.get(view.package, 'manifest');
        // mainView.router.load({
        //     // template: Template7.templates.aboutTemplate, // template already compiled and available as a property of Template7.templates
        //     content: view.html,
        //     context: {
        //         basePath: this.basePath(manifest.package, manifest.version),
        //         view: view,
        //         // manifest: manifest,
        //         data: T.env.data
        //     }
        // })
    },

    // evalPageJavaScript: function(view) {
    //     if (view) {
    //         if (view.jsSrcs && view.jsSrcs.length) {
    //             for (var i = 0; i < view.jsSrcs.length; i++) {
    //                 // BUG: Script not run when created with F7 DOM?
    //                 // $$('<script/>').attr('src', view.jsSrcs[i]).attr('type', 'text/javascript').appendTo('head'); //document.body
    //                 var script = document.createElement('script');
    //                 script.type = 'text/javascript';
    //                 script.src = view.jsSrcs[i];
    //                 document.body.appendChild(script);
    //             }
    //             // view.jsSrcs = null; // only run once
    //         }
    //         if (view.js && view.js.length) {
    //             eval(view.js);
    //             // view.js = null; // only run once
    //         }
    //     }
    // },

    filePath: function(package, version, fileName) {
        if (typeof(fileName) === 'undefined')
            fileName = '';
        return '/addons/' + package + '/' + version + '/' + fileName;
    },

    // basePath: function(package, version) {
    //     return '/addons/' + package + '/' + version + '/';
    // },

    loadFile: function(package, version, fileName, local, callback) {
        var filePath = this.filePath(package, version, fileName);
        if (local) {
            $.ajax({
               url: this.filePath(package, version, fileName),
               type: 'GET',
               success: function(data, status, xhr) {
                  callback(null, data);
               },
               error: function(xhr, status, error) {
                  callback(error || 'Bad request', null);
               }
            });
        } else {
            T.api.get(filePath, {}, callback); //'/addons/' + package + '/file/' + fileName
        }
    },

    addAddonToUI: function(manifest) {
        alert('virtual method');
    },

    addViewToUI: function(manifest, view, data) {
        // alert('addViewToUI: implement me');
        var self = this,
            package = manifest.package,
            local = this.get(package, 'local'),
            $page = $$(data),
            pageContent;

        console.log('add addon view', view.id, data);

        // HTML content of new page
        if (view.framed) {
            pageContent = '' +
              '<div class="navbar">' +
                '<div class="navbar-inner">' +
                  '<div class="left"><a href="#" class="back link"><i class="icon icon-back"></i><span>Back</span></a></div>' +
                  '<div class="center sliding">' + view.title + '</div>' +
                  // '<div class="right">' +
                  //   '<a href="#" class="link icon-only open-panel"> <i class="icon icon-bars"></i></a>' +
                  // '</div>' +
                '</div>' +
              '</div>' +
              // '<div class="pages">' +
                '<div class="page addon-' + view.id + '" data-page="' + view.id + '">' +
                  '<div class="page-content">' +
                    '<iframe width="100%" height="100%" frameborder="0" seamless="seamless"></iframe>' +
                  '</div>' +
                '</div>' //+
              // '</div>'
              ;
        }
        else {
            pageContent = data;
        }

        // Parse JavaScripts to be evaluated
        // var js = '', jsSrcs = [];
        // var $scripts = $$('<div>').html(data).find('script[type="text/javascript"]').remove();
        // $scripts.each(function() {
        //     var $this = $$(this);
        //     if ($this.attr('src'))
        //         jsSrcs.push($this.attr('src'));
        //     else
        //         js += $this.text();
        // });
        //
        // var $templates = $$('<div>').html(data).find('script[type="text/template7"]').remove();
        // $templates.each(function() {
        //     $$('body').append(this);
        // });

        // Store the page view data
        view.html = pageContent;
        view.data = data;
        // view.js = js;
        // view.jsSrcs = jsSrcs;
        view.package = package;
        this.views[package + '-' + view.id] = view;
    },

    loadPageView: function(manifest, view) {
      var self = this,
          package = manifest.package,
          version = manifest.version,
          local = this.get(package, 'local'),
          path = self.filePath(manifest.package, manifest.version);

      this.loadFile(package, version, view.file, local, function(err, res) {
          // view.id = view.id || package + '-' + T.util.parameterize(view.name);

          T.env.t7.global.addons[manifest.package].path = path;

          // Render view template
          res = T.util.compileTemplate7(res, {
              // basePath: basePath,
              view: view,
              // manifest: manifest,
              data: T.env.data
          });
          self.addViewToUI(manifest, view, res);

          $$(document).trigger('tommy:addon:view:create', {
              package: package, manifest: manifest, view: view });
      });
    },

    onManifestLoaded: function(manifest) {
        this.set(manifest.package, 'manifest', manifest);
        this.addAddonToUI(manifest); //.package

        if (manifest.views && manifest.views.length) {

            // Setup template context
            if (!T.env.t7.global)
                T.env.t7.global = {};
            if (!T.env.t7.global.addons)
                T.env.t7.global.addons = {};
            if (!T.env.t7.global.addons[manifest.package])
                T.env.t7.global.addons[manifest.package] = {};

            // Add each of the views to the interface
            for (i = 0; i < manifest.views.length; i++) {
                var view = manifest.views[i];
                switch(view.type) {
                    case 'template':
                        this.loadTemplateView(manifest, view);
                        break;
                    case 'page':
                        this.loadPageView(manifest, view);
                        break;
                    default:
                        alert('Unknown view type: ' + view.type)
                }
            }
        }
    },

    loadTemplateView: function(manifest, view) {
        var filePath = this.filePath(manifest.package, manifest.version, view.file)
        $$.get(filePath, function(data) {
            $$('body').append(data);
        });
    },

    load: function(package, version, local, callback) {
        console.log('load addons', package, version, local);
        var self = this;
        this.loadFile(package, version, 'manifest.yml', local, function(err, res) {
            var manifest = jsyaml.load(res); //JSON.parse(res);
            self.set(package, 'local', local);
            self.onManifestLoaded(manifest);
            if (callback)
                callback(manifest);
        });
    },

    get: function(package, key) {
        return key ? this.addons[package][key] : this.addons[package];
    },

    set: function(package, key, value) {
        if (typeof this.addons[package] === 'undefined')
            this.addons[package] = {};
        this.addons[package][key] = value;
    },

    loadAllRemote: function() {
        var self = this;

        // Get a list of installed addons from the API
        T.api.get('/installed_addons', {}, function(err, res) {
            console.log('installed addons response', err, res);
            if (err) {
                alert('API error: Could not load installed addons');
                return;
            }

            for (var i = 0; i < res.length; i++) {
                var ext = res[0];
                self.load(ext.package, false);
            }
        });
    }
};
