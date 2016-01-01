
// Overwrite the following Tommy prototype methods for use inside the
// emulator dev environemnt:

Tommy.Extensions.prototype.addExtensionToUI = function(package) {
  var manifest = this.get(package, 'manifest');
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
}

Tommy.Extensions.prototype.addViewToUI = function(package, view, data) {
  var self = this;
  var manifest = this.get(package, 'manifest');
  var viewId = package + '-' + view.name;
  var $page = $(data);

  console.log('add extension view', view.name);

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

    self.showView(viewId);
  });

  // Parse JavaScripts to be evaluated
  var js = '';
  var $scripts = $page.find('script').addBack('script');
  $scripts.each(function() {
    js += $(this).text();
  });

  // Store the page view data
  view.html = pageContent;
  view.data = data;
  view.js = js;
  this.views[viewId] = view;
};
