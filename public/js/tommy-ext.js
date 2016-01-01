/** Class: Tommy.Extensions
 *  Create a Tommy.Extensions object.
 */

Tommy.Extensions = function() {
  this.views = {};

  var self = this;
  T.env.f7App.onPageAfterAnimation('*', function (page) {
    var $page = $(page.container);
    var view = self.views[page.name];

    console.log('after load page', page.name, view);

    if (view) {

      // Inject content for framed views
      if (view.view.framed) {
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
};

Tommy.Extensions.prototype = {

    showPage: function(viewId) {
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

    addExtensionToUI: function(manifest) {
      var extItem = $('<li class="accordion-item"><a href="#" class="item-content item-link">' +
          '<div class="item-inner">' +
            '<div class="item-title">' + manifest.name + '</div>' +
          '</div></a>' +
        '<div class="accordion-item-content">' +
          '<div class="content-block">' +
            '<pre><code>' + JSON.stringify(manifest, null, 2) + '</code></pre>' +
          '</div>' +
        '</div>' +
      '</li>');

      // Add the extension menu
      $('.extensions-nav').append(extItem);
    },

    addViewToUI: function(manifest, view, data) {
      var self = this;
      var viewId = manifest.package + '-' + view.name;
      var $page = $(data);

      console.log('add extension view', view.name);

      // HTML content of new page:
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
            '<div class="page" data-page="' + viewId + '">' +
              '<div class="page-content">' +
                (view.framed ?
                  '<iframe width="100%" height="100%" frameborder="0" seamless="seamless"></iframe>' : data)
              '</div>' +
            '</div>' +
          '</div>';

      // Create the sidebar menu item
      var navItem = $('<li><a href="#' + viewId + '" class="item-link">' +
        '<div class="item-content">' +
          '<div class="item-inner">' +
            '<div class="item-title">' + view.name + '</div>' +
            '<div class="item-after">' + (manifest.local ? 'Local' : 'Remote') + '</div>' +
          '</div>' +
        '</div></a></li>');

      // Add the sidebar menu
      $('.extension-views-nav').append(navItem);

      // Handle sidebar clicks to display the page
      // TODO: does f7 have a better way to handle this?
      $('.extension-views-nav a[href="#' + viewId + '"]').unbind('click').click(function() {
        if ($('.view-main').data('page') == viewId)
          return;

        self.showPage(viewId);
      });

      // Parse JavaScripts to be evaluated
      var js = '';
      var $scripts = $page.find('script').addBack('script');
      $scripts.each(function() {
        js += $(this).text();
      });

      // Store the page data
      this.views[viewId] = {
        html: pageContent,
        data: data,
        view: view,
        js: js
      }
    },

    //
    // Remote API
    //

    loadAll: function() {
      var self = this;

      // Get a list of installed extensions from the API
      T.api.get('/installed_extensions', {}, function(err, res) {
        console.log('installed extensions response', err, res);
        if (err) {
          alert('API error: Could not fetch installed extensions');
          return;
        }

        // Add each of the views to the interface
        for (i = 0; i < res.length; i++) {
          var ext = res[0].extension;
          self.loadFile(ext.package, 'manifest.json', function(err, res) {
              var manifest = res; //JSON.parse(data);
              console.log('loaded remote', manifest);

              T.env.extensions[ext.package] = { manifest: manifest };
              self.addExtensionToUI(manifest);

              // Add each of the views to the interface
              for (i = 0; i < manifest.views.length; i++) {
                var view = manifest.views[i];
                self.loadView(manifest, view);
              }
          })
        }
      });
    },

    loadFile: function(package, fileName, callback) {
      T.api.get('/extensions/' + package + '/' + fileName, {}, callback);
    },

    loadView: function(manifest, view) {
      var self = this;
      this.loadFile(manifest.package, view.file, function(err, res) {
        self.addViewToUI(manifest, view, res);
      });
    },

    //
    // Local Developer API
    //

    loadLocal: function(package) {
      var self = this;

      // Load the extension manifest
      this.loadLocalFile(package, 'manifest.json', function(data) {
        var manifest = data; //JSON.parse(data);
        console.log(manifest);

        manifest.local = true;
        T.env.extensions[package] = { manifest: manifest };
        self.addExtensionToUI(manifest);

        // Add each of the views to the interface
        for (i = 0; i < manifest.views.length; i++) {
          var view = manifest.views[i];
          self.loadLocalView(manifest, view);
        }
      });
    },

    loadLocalFile: function(package, fileName, callback) {
      $.get('/extensions/' + package + '/' + fileName, callback);
    },

    loadLocalView: function(manifest, view) {
      var self = this;
      this.loadLocalFile(manifest.package, view.file, function(data) {
        self.addViewToUI(manifest, view, data);
      });
    }
};
