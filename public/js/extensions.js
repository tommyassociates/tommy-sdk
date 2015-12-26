var Extensions;


/** Class: Extensions
 *  Create a Extensions object.
 *
 *  @param (string) apiKey - The developer API key to authenticate requests with.
 */

Extensions = function(f7App, f7View)
{
    this.f7App = f7App;
    this.f7View = f7View;
    this.extensions = {};
    this.pages = {};

    var self = this;
    this.f7App.onPageAfterAnimation('*', function (page) {
      // Evaluate queued JavaScripts after animation completes
      self.evalPageJavaScript(page.name);
    });
};

Extensions.prototype = {

    showPage: function(pageId)
    {
        this.f7View.router.loadContent(this.pages[pageId].html);
    },

    evalPageJavaScript: function(pageId)
    {
        if (this.pages[pageId] &&
          this.pages[pageId].js &&
          this.pages[pageId].js.length) {
          eval(this.pages[pageId].js);
          // this.pages[pageId].js = null; // only run once
        }
    },

    loadLocalExtension: function(package, fileName)
    {
        var self = this;

        // Load the extension config
        this.loadLocalExtensionFileByName(package, 'config.json', function(data) {
            var config = data; //JSON.parse(data);
            console.log(config);

            self.extensions[package] = { config: config };

            // Add each of the views to the interface
            for (i = 0; i < config.views.length; i++) {
                var view = config.views[i];
                console.log(view);
                self.loadLocalExtensionFileByName(package, view.file, function(data) {
                    var pageId = package + '-' + view.name;

                    // HTML content of new page:
                    var pageContent = '' +
                      '<div class="navbar">' +
                        '<div class="navbar-inner">' +
                          '<div class="left"><a href="#" class="back link"> <i class="icon icon-back"></i><span>Back</span></a></div>' +
                          '<div class="center sliding">' + config.name + '</div>' +
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

                    // Evaluate JavaScripts
                    var js = '';
                    var $scripts = $(data).find('script').addBack('script');
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
        });
    },

    loadLocalExtensionFileByName: function(package, fileName, callback)
    {
        $.get('/extensions/' + package + '/' + fileName, callback);
    }
};
