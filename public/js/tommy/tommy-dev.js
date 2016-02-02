
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
