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
      T.env.f7App.onPageAfterAnimation('*', function (page) {
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

          // Move page elements to proper scope
          $('body').append($page.find('.popup'));

          // Evaluate queued JavaScripts after animation completes
          self.evalPageJavaScript(page.name);
        }
      });
    },

    showView: function(viewId) {
      T.env.f7View.router.loadContent(this.views[viewId].html);
    },

    evalPageJavaScript: function(viewId) {
      if (this.views[viewId] &&
        this.views[viewId].js &&
        this.views[viewId].js.length) {
        eval(this.views[viewId].js);
        // this.views[viewId].js = null; // only run once
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
      alert('addViewToUI: implement me');
    },

    loadView: function(package, view) {
      var self = this;
      var local = this.get(package, 'local');
      this.loadFile(package, view.file, local, function(err, res) {
        self.addViewToUI(package, view, res);
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

    load: function(package, local) {
      var self = this;
      this.loadFile(package, 'manifest.json', local, function(err, res) {
        var manifest = res; //JSON.parse(res);
        self.set(package, 'local', local);
        self.onManifestLoaded(manifest);
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

        for (i = 0; i < res.length; i++) {
          var ext = res[0].extension;
          self.load(ext.package, false);
        }
      });
    }
};
