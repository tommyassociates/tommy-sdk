/** Class: Tommy.Extensions
 *  Create a Tommy.Extensions object.
 */

Tommy.Extensions = function()
{
    this.pages = {};

    var self = this;
    T.Env.f7App.onPageAfterAnimation('*', function (page) {

      // Move page elements to proper scope
      var $page = $(page.container);
      $('body').append($page.find('.popup'));

      // Evaluate queued JavaScripts after animation completes
      self.evalPageJavaScript(page.name);
    });
};

Tommy.Extensions.prototype = {

    showPage: function(pageId) {
        T.Env.f7View.router.loadContent(this.pages[pageId].html);
    },

    evalPageJavaScript: function(pageId) {
        if (this.pages[pageId] &&
          this.pages[pageId].js &&
          this.pages[pageId].js.length) {
          eval(this.pages[pageId].js);
          // this.pages[pageId].js = null; // only run once
        }
    },

    loadLocalExtension: function(package, fileName) {
        var self = this;

        // Load the extension config
        this.loadLocalExtensionFile(package, 'config.json', function(data) {
            var config = data; //JSON.parse(data);
            console.log(config);

            T.Env.extensions[package] = { config: config, local: true };

            // Add each of the views to the interface
            for (i = 0; i < config.views.length; i++) {
                var view = config.views[i];
                self.loadExtensionView(config, view);
            }
        });
    },

    loadLocalExtensionFile: function(package, fileName, callback) {
        $.get('/extensions/' + package + '/' + fileName, callback);
    },

    loadExtensionView: function(config, view) {
        var self = this;

        console.log(view);
        this.loadLocalExtensionFile(config.package, view.file, function(data) {
            var pageId = config.package + '-' + view.name;
            console.log('loaded', pageId);

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
                '<div class="page" data-page="' + pageId + '">' +
                  '<div class="page-content">' +
                    data
                  '</div>' +
                '</div>' +
              '</div>';

            // Create the sidebar menu item
            var navItem = $('<li><a href="#' + pageId + '" class="item-link">' +
                '<div class="item-content">' +
                  '<div class="item-inner">' +
                    '<div class="item-title">' + view.name + '</div>' +
                  '</div>' +
                '</div></a></li>');

            // Add the sidebar menu
            $('.extension-list').append(navItem);

            // Handle sidebar clicks to display the page
            // TODO: does f7 have a better way to handle this?
            $('.extension-list a[href="#' + pageId + '"]').unbind('click').click(function() {
              if ($('.view-main').data('page') == pageId)
                return;

              self.showPage(pageId);
            });

            var $page = $(data);

            // Evaluate JavaScripts
            var js = '';
            var $scripts = $page.find('script').addBack('script');
            $scripts.each(function() {
              js += $(this).text();
            });

            // Store the page data
            self.pages[pageId] = {
              html: pageContent,
              js: js
            }
        });
    }
};

// Assign a short accessor for the Tommy.Extensions object
window.T.Ext = Tommy.Extensions;
