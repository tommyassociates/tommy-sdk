/** Class: Tommy.Extensions
 *  Create a Tommy.Extensions object.
 */

Tommy.Extensions = function() {
  this.bind();
};

Tommy.Extensions.prototype = {

    /**
     *  Object containing all extension objects scoped by package name.
     */

    extensions: {},

    /**
     *  Object containing all extension view objects scoped by package view name.
     */

    views: {},

    /**
     *  Bind the extensions interface.
     */

    bind: function() {
      var self = this;
      T.env.f7App.onPageAfterAnimation('*', function(page) {
        var $page = $(page.container);
        var view = self.views[page.name];

        console.log('after load page', page.name, view);
        if (view) {

          // Inject content for framed views
          if (view.framed) {
            var $iframe = $page.find('.page-content > iframe:first');
            $iframe.ready(function() {
              $iframe.contents().find("body").append(view.data);
            });
          }

          if (view.type == 'form') {
            $page.find('input, select, textarea').change(function() {
              console.log('input change');
              var $e = $(this);
              if (!$e.val() || !$e.attr('name')) {
                console.log('skipping invalid input');
                return;
              }
              T.api.create('/settings', {
                key: 'extensions:' + view.package + ':' + $e.attr('name'),
                data: $e.val()
              }, function(err, res) {
                console.log('created setting', err, res);
              });
            });
          }

          // Move page elements to proper scope
          $('body').append($page.find('.popup'));

          // Evaluate queued JavaScripts after animation completes
          self.evalPageJavaScript(view);
        }
      });
    },

    showView: function(viewId) {
      T.env.f7View.router.loadContent(this.views[viewId].html);
    },

    evalPageJavaScript: function(view) {
      if (view) {
        if (view.jsSrcs && view.jsSrcs.length) {
          for (var i = 0; i < view.jsSrcs.length; i++) {
            $('<script>').attr('src', view.jsSrcs[i]).appendTo(document.body);
          }
          // view.jsSrcs = null; // only run once
        }
        if (view.js && view.js.length) {
          eval(view.js);
          // view.js = null; // only run once
        }
      }
    },

    loadFile: function(package, fileName, local, callback) {
      if (local) {
        $.ajax({
           url: '/extensions/' + package + '/' + fileName,
           type: 'GET',
           success: function(data, status, xhr) {
             callback(null, data);
           },
           error: function(xhr, status, error) {
             callback(error || 'Bad request', null);
           }
        });
      } else {
        T.api.get('/extensions/' + package + '/' + fileName, {}, callback);
      }
    },

    addExtensionToUI: function(package) {
      alert('addExtensionToUI: implement me');
    },

    addViewToUI: function(package, view, data) {
      // alert('addViewToUI: implement me');
      var self = this;
      var manifest = this.get(package, 'manifest');
      var local = this.get(package, 'local');
      var $page = $(data);

      //var view.id = package + '-' + view.name;

      console.log('add extension view', view.id);

      // HTML content of new page
      var pageContent = '' +
        '<div class="navbar">' +
          '<div class="navbar-inner">' +
            '<div class="left"><a href="#" class="back link"> <i class="icon icon-back"></i><span>Back</span></a></div>' +
            '<div class="center sliding">' + view.name + '</div>' +
            '<div class="right">' +
              '<a href="#" class="link icon-only open-panel"> <i class="icon icon-bars"></i></a>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="pages">' +
          '<div class="page" data-page="' + view.id + '">' +
            '<div class="page-content">' +
              (view.framed ?
                '<iframe width="100%" height="100%" frameborder="0" seamless="seamless"></iframe>' : data)
            '</div>' +
          '</div>' +
        '</div>';

      // Parse JavaScripts to be evaluated
      var js = '', jsSrcs = [];
      var $scripts = $page.find('script').addBack('script');
      $scripts.each(function() {
        console.log('script', this)
        if ($(this).attr('src'))
          jsSrcs.push($(this).attr('src'));
        else
          js += $(this).text();
      });

      // Store the page view data
      view.html = pageContent;
      view.data = data;
      view.js = js;
      view.jsSrcs = jsSrcs;
      view.package = package;
      this.views[view.id] = view;
    },

    loadView: function(package, view) {
      var self = this;
      var manifest = this.get(package, 'manifest');
      var local = this.get(package, 'local');
      this.loadFile(package, view.file, local, function(err, res) {
        view.id = package + '-' + view.name;
        res = res.replace(new RegExp('{{basePath}}', 'g'), '/extensions/' + package + '/');
        console.log(res);
        self.addViewToUI(package, view, res);

        $(document).trigger('tommy:extension:view:create', {
          package: package, manifest: manifest, view: view });
      });
    },

    onManifestLoaded: function(manifest) {
      this.set(manifest.package, 'manifest', manifest);
      this.addExtensionToUI(manifest.package);

      // Add each of the views to the interface
      for (i = 0; i < manifest.views.length; i++) {
        var view = manifest.views[i];
        this.loadView(manifest.package, view);
      }
    },

    load: function(package, local, callback) {
      var self = this;
      this.loadFile(package, 'manifest.json', local, function(err, res) {
        var manifest = res; //JSON.parse(res);
        self.set(package, 'local', local);
        self.onManifestLoaded(manifest);
        if (callback)
          callback(manifest);
      });
    },

    get: function(package, key) {
      return key ? this.extensions[package][key] : this.extensions[package];
    },

    set: function(package, key, value) {
      if (typeof this.extensions[package] === 'undefined')
        this.extensions[package] = {};
      this.extensions[package][key] = value;
    },

    loadAllRemote: function() {
      var self = this;

      // Get a list of installed extensions from the API
      T.api.get('/installed_extensions', {}, function(err, res) {
        console.log('installed extensions response', err, res);
        if (err) {
          alert('API error: Could not load installed extensions');
          return;
        }

        for (var i = 0; i < res.length; i++) {
          var ext = res[0];
          self.load(ext.package, false);
        }
      });
    }
};
