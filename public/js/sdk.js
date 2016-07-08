Tommy.SDK = function() {
    this.loadTemplates();
    this.startSession();
    this.bind();
};

Tommy.SDK.prototype.bind = function() {
    $$(document).on('ajaxStart', function(e) {
        T.env.f7App.showIndicator();
        console.log('Ajax request started', e);
    });

    $$(document).on('ajaxComplete', function(e) {
        T.env.f7App.hideIndicator();
        console.log('Ajax request complete', e);
    });
}

Tommy.SDK.prototype.startSession = function() {
    T.api.create('/sessions', {}, function(err, res) {
        console.log('Logged in', err, res)
        T.env.data.user = res;
        T.env.data.token = res.token;
        T.api.token = res.token; // replace API key with session token

        if (!err) {
            // T.api.get('/user', {}, function(err, res) {
            //     T.env.data.currentUser = res;
            // });

            T.api.get('/user/current_account', {}, function(err, res) {
                T.env.data.account = res;
                $$('.current-avatar').attr('src', res.icon_url);
                T.sdk.normalizeAccountData();
            });

            T.api.get('/user/accounts', {}, function(err, res) {
                T.env.data.accounts = res;
                T.sdk.normalizeAccountData();
            });
        }
    });
}

Tommy.SDK.prototype.loadTemplates = function() {
    $$.get('/public/global.tpl.html', function(data) {
        $$('body').append(data);
    });
}

Tommy.SDK.prototype.normalizeAccountData = function() {
  if (!T.env.data.accounts || !T.env.data.currentAccount)
      return;

  for (var i = 0; i < T.env.data.accounts.length; i++) {
      var account = T.env.data.accounts[i];
      if (account.id == T.env.data.currentAccount.id &&
          account.type == T.env.data.currentAccount.type)
      account.current = true; // set current account flag
  }
}

Tommy.SDK.prototype.changeAccount = function(accountId, accountType) {
  console.log('Change account', accountId, accountType)
  T.api.update('/user/current_account', {
    current_account_id: accountId,
    current_account_type: accountType
  }, function(err, res, xhr) {
    T.env.data.currentAccount = res;
    T.sdk.normalizeAccountData();
  });
}

// Tommy.SDK.prototype.renderTemplate7 = function(template, context, element) {
//   console.log('Rendering template', template, context)
//   var compiledTemplate = Template7.compile($$('#' + template).html());
//   var html = compiledTemplate(context);
//   if (element)
//     $$(element).html(html);
//   return html;
// }

//
// Main Page
//

Tommy.SDK.prototype.loadLocalAddons = function(package, version) {
  $$.getJSON('/addons', function (data) {
    console.log('Loaded local addons', data)
    for (var package in data) {
      var versions = data[package];
      for (var i = 0; i < versions.length; i++) {
        T.addons.load(package, versions[i], true);
      }
    }
  });
}

//
// Addon Details Page
//

// Tommy.SDK.prototype.getAddonDetailsPage = function(package, version) {
//   return $$('.page[data-package="' + package + '"][data-version="' + version + '"]');
// }

Tommy.SDK.prototype.initAddonDetailsSandbox = function(package, version, callback) {
  T.apiSandbox.get('/addons/' + package + '/versions/' + version, {}, function(err, res) {
    T.sdk.renderAddonDetailsSandbox(res);
    if (callback)
      callback(err, res);
  });
}

Tommy.SDK.prototype.initAddonDetailsStore = function(package, version, callback) {
  T.api.get('/addons/' + package + '/versions/' + version, {}, function(err, res) {
    T.sdk.renderAddonDetailsStore(res);
    if (callback)
      callback(err, res);
  });
}

Tommy.SDK.prototype.renderAddonDetailsSandbox = function(context) {
  T.util.renderTemplate7('addonDetailsSandboxTemplate', context || {}, '#addon-details-sandbox');
}

Tommy.SDK.prototype.renderAddonDetailsStore = function(context) {
  T.util.renderTemplate7('addonDetailsStoreTemplate', context || {}, '#addon-details-store');
}

Tommy.SDK.prototype.uploadSandboxAddon = function(package, version, callback) {
  console.log('Installing addon', package, version);
  T.sdk.renderAddonDetailsSandbox({ uploading: true });
  $$.ajax({
    url: '/addon/sandbox/upload/' + package + '/' + version,
    method: 'POST',
    dataType: 'json',
    success: function(data, status, xhr) {
      T.sdk.renderAddonDetailsSandbox(data);
      myApp.addNotification({
          title: 'Addon Uploaded',
          message: 'Your addon uploaded successfully',
          hold: 4000
      });
      if (callback)
        callback(null, data);
    },
    error: function(xhr, status) {
      myApp.addNotification({
          title: 'Addon Upload Failed',
          message: 'Your addon uploaded failed: ' + xhr.responseText,
          hold: 4000
      });
      if (callback)
        callback(xhr.responseText, null);
    }
  });
}

Tommy.SDK.prototype.submitStoreAddon = function(package, version, callback) {
  console.log('Submitting addon', package, version);
  T.sdk.renderAddonDetailsStore({ submitting: true });
  $$.ajax({
    url: '/addon/store/submit/' + package + '/' + version,
    method: 'POST',
    dataType: 'json',
    success: function(data, status, xhr) {
      data.submitted = true;
      T.sdk.renderAddonDetailsStore(data);
      myApp.addNotification({
          title: 'Addon Submitted',
          message: 'Your addon was submitted successfully and is prending review.',
          hold: 4000
      });
      if (callback)
        callback(null, data);
    },
    error: function(xhr, status) {
      myApp.addNotification({
          title: 'Addon Submittion Failed',
          message: 'Your addon submission failed: ' + xhr.responseText,
          hold: 4000
      });
      if (callback)
        callback(xhr.responseText, null);
    }
  });
}

Tommy.SDK.prototype.deleteSandboxAddon = function(package, version, callback) {
  console.log('Uninstalling addon version', package, version);
  T.sdk.renderAddonDetailsSandbox({ status: 'Deleting...', deleting: true });
  T.apiSandbox.delete('/addons/' + package + '/versions/' + version, {}, function(err, res) {
    T.sdk.renderAddonDetailsSandbox();
    if (err) {
      myApp.addNotification({
          title: 'Addon Error',
          message: 'Addon uninstall failed: ' + err,
          hold: 4000
      });
    }
    else {
      myApp.addNotification({
          title: 'Addon Uninstalled',
          message: 'Addon uninstalled successfully',
          hold: 4000
      });
    }
    if (callback)
      callback(err, res);
  });
}

Tommy.SDK.prototype.deleteStoreAddon = function(package, version, callback) {
  console.log('Deleting store addon version', package, version);
  T.sdk.renderAddonDetailsStore({ status: 'Deleting...', deleting: true });
  T.api.delete('/addons/' + package + '/versions/' + version, {}, function(err, res) {
    T.sdk.renderAddonDetailsStore();
    if (err) {
      myApp.addNotification({
          title: 'Addon Deleted',
          message: 'Addon delete failed: ' + err,
          hold: 4000
      });
    }
    else {
      myApp.addNotification({
          title: 'Addon Deleted',
          message: 'Addon deleted successfully',
          hold: 4000
      });
    }
    if (callback)
      callback(err, res);
  });
}


// Overwrite the following Tommy prototype methods for use inside the
// emulator dev environemnt:

Tommy.Addons.prototype.addAddonToUI = function(manifest) {
  var iconPath = this.localFilePath(manifest.package, manifest.version, 'icon.png');

  var extItem = $$('<li><a href="/addon-details.html?package=' + manifest.package + '&package=' + manifest.package + '&version=' + manifest.version + '" class="item-link item-content">' +
      '<div class="item-media"><img src="' + iconPath + '" width="80"></div>' +
      '<div class="item-inner">' +
        '<div class="item-title-row">' +
          '<div class="item-title">' + manifest.name + '</div>' +
          '<div class="item-after">' + manifest.version + '</div>' +
        '</div>' +
        // '<div class="item-subtitle">' + manifest.version + '</div>' +
        '<div class="item-text">' + manifest.summary + '</div>' +
    '</div></a>' +
    '<div class="accordion-item-content">' +
      '<div class="content-block">' +
        '<pre><code>' + JSON.stringify(manifest, null, 2) + '</code></pre>' +
      '</div>' +
    '</div>' +
  '</li>');

  // Add the addon menu
  $$('.addons-nav').append(extItem);

  extItem.find('a').click(function() {
    mainView.router.load({
      url: this.href,
      context: manifest
    });
    return false;
  });
}
