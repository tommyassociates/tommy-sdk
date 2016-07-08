// Initialize your app
var myApp = new Framework7({
  pushState: false,
  // preroute: preroute,
  // preprocess: preprocess,
  modalTitle: '',
  precompileTemplates: true,
  template7Pages: true,
  template7Data: {
    'page:settings': function() { return T.env.data; }
  }
});

// Export selectors engine
var $$ = Dom7;

// Add view
var mainView = myApp.addView('.view-main', {
  // Because we use fixed-through navbar we can enable dynamic navbar
  dynamicNavbar: true,
  domCache: true
});


// myApp.onPageInit('*', function(page) {
//   console.log('router', 'pageInit', page);
// });

// $$('.do-switch-account').click(function() {
//   T.env.f7App.popup(T.sdk.renderTemplate('accountListPopupTemplate', T.env.data.accounts));
// });

myApp.onPageInit('settings', function(page) {
  console.log('router', 'pageInit', page, Template7.global);
  var $page = $$(page.container)//,
    // package = page.query.package,
    // version = page.query.version;

  $page.on('change', 'select[name="current-user"]', function(event) {
    var values = $$(this).val().split('-');
    T.sdk.changeAccount(values[0], values[1]);
  });
});


// Init Addon Details
myApp.onPageInit('addon-details', function(page) {
  console.log('router', 'pageInit', page);
  var $page = $$(page.container),
    package = page.query.package,
    version = page.query.version;

  // Query addon installed status from the sandbox server
  T.sdk.initAddonDetailsSandbox(package, version);
  T.sdk.initAddonDetailsStore(package, version);

  // Sandbox actions
  $page.on('click', 'a[data-command="sandbox-upload"]', function() {
    T.sdk.uploadSandboxAddon(package, version);
  });

  $page.on('click', 'a[data-command="sandbox-delete"]', function() {
    T.sdk.deleteSandboxAddon(package, version);
  });

  // Store actions
  $page.on('click', 'a[data-command="store-submit"]', function() {
    T.sdk.submitStoreAddon(package, version);
  });

  $page.on('click', 'a[data-command="store-delete"]', function() {
    T.sdk.deleteStoreAddon(package, version);
  });
});

// // Callbacks to run specific code for specific pages, for example for About page:
// myApp.onPageInit('about', function (page) {
//     // run createContentPage func after link was clicked
//     $$('.create-page').on('click', function () {
//         createContentPage();
//     });
// });
//
// // Generate dynamic page
// var dynamicPageIndex = 0;
// function createContentPage() {
// 	mainView.router.loadContent(
//         '<!-- Top Navbar-->' +
//         '<div class="navbar">' +
//         '  <div class="navbar-inner">' +
//         '    <div class="left"><a href="#" class="back link"><i class="icon icon-back"></i><span>Back</span></a></div>' +
//         '    <div class="center sliding">Dynamic Page ' + (++dynamicPageIndex) + '</div>' +
//         '  </div>' +
//         '</div>' +
//         '<div class="pages">' +
//         '  <!-- Page, data-page contains page name-->' +
//         '  <div data-page="dynamic-pages" class="page">' +
//         '    <!-- Scrollable page content-->' +
//         '    <div class="page-content">' +
//         '      <div class="content-block">' +
//         '        <div class="content-block-inner">' +
//         '          <p>Here is a dynamic page created on ' + new Date() + ' !</p>' +
//         '          <p>Go <a href="#" class="back">back</a> or go to <a href="services.html">Services</a>.</p>' +
//         '        </div>' +
//         '      </div>' +
//         '    </div>' +
//         '  </div>' +
//         '</div>'
//     );
// 	return;
// }
