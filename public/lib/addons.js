define(['api','util','config','cache','util','Framework7'],
function(api,util,config,cache,util) {
    var t7 = Template7;

    var addons = {

        /**
         *  Object containing all addon objects scoped by package name and version.
         */

        addons: {},

        /**
         *  Object containing all addon view objects scoped by package view name.
         */

        views: {},

        /**
         *  Object containing all addon asset URLs that have been loaded.
         */

        loadedAssetURLs: [],

        /**
         *  Init the addons interface.
         */

        init: function () {
            if (!t7.global)
                t7.global = {};
            // if (!t7.global.addons)
            //     t7.global.addons = {};
            if (!t7.global.addonViews)
                t7.global.addonViews = {};

            // this.bind();

            tommyApp.onPageInit('*', this.onEnterAddon); //onPageAfterAnimation
            tommyApp.onPageBeforeAnimation('*', this.onExitAddon);
        },

        /**
         *  Bind the addons interface.
         */

        preprocess: function (content, url) {
            if (!t7.global.currentAddon) {
                var pos = url.indexOf('/addons');
                if (pos !== -1) {
                    var parts = url.substring(pos + 1).split('/');
                    if (parts.length >= 4 && parts[0] == 'addons' && parts[2] == 'versions') {
                        var package = parts[1],
                            version = parts[3],
                            addon = cache.get('addons', package);

                        // Set the last visible addon for template URL helpers
                        // such as `addonAssetUrl`
                        t7.global.currentAddon = addon;
                        t7.global.currentAddon.pageUrl = url;

                        console.log('entering addon context', t7.global.currentAddon)
                    }
                }
            }

            return content;
        },

        onExitAddon: function (page) {

            // If we're navigating away form the addon then unset the
            // currentAddon variable
            if (t7.global.currentAddon &&
                t7.global.currentAddon.pageUrl === page.fromPage.url && page.from === 'left') {
                console.log('leaving addon context', page, t7.global.currentAddon)
                t7.global.currentAddon = null;
                t7.global.currentActorId = null; // unset the API actor override
            }
        },

        onEnterAddon: function (page) {
            if (!t7.global.currentAddon) {
                return;
            }

            var $page = $$(page.container),
                package = $page.data('addon'),
                viewId = $page.data('view'),
                view = addons.getView(package, viewId),
                addon = t7.global.currentAddon,
                version = addon.version;

            // Set the actor ID
            if (page.context.actor_id) {
                console.log('render setting actor id', page.context.actor_id);
                // t7.global.currentAddon.actorId = page.context.url_query.actor_id;
                t7.global.currentActorId = page.context.actor_id;
            // }
            // else {
            //     t7.global.currentActorId = config.getCurrentUser().id;
            }

            if (view && !view.initialized) {
                view.initialized = true;

                console.log('render addon view page', page.name, view);

                $page.data('uid', view.uid);

                // Inject content for framed views
                if (view.framed) {
                    var $iframe = $page.find('.page-content > iframe:first');
                    $iframe.ready(function () {
                        $iframe.contents().find('body').append(view.data);
                    });
                }

                // // Bind addon configuration forms
                // if (view.type == 'form') {
                //     $page.find('input, select, textarea').change(function () {
                //         // console.log('input change');
                //         var $e = $$(this);
                //         if (!$e.val() || !$e.attr('name')) {
                //             console.log('skipping invalid input');
                //             return;
                //         }
                //         api.create('/settings', {
                //             name: 'addons:' + view.package + ':' + $e.attr('name'),
                //             value: $e.val()
                //         }, function (err, res) {
                //             console.log('created setting', err, res);
                //         });
                //     });
                // }

                // Move addon page elements to global scope
                $$('body').append($page.find('.popup'));
            }
        },

        loadFile: function (package, version, fileName, callback) {
            // var viewpath = util.addonAssetPath(package, version, fileName);, local
            // if (local) {
            //     $.ajax({
            //        url: this.viewPath(package, version, fileName),
            //        type: 'GET',
            //        success: function (data, status, xhr) {
            //           callback(null, data);
            //        },
            //        error: function (xhr, status, error) {
            //           callback(error || 'Bad request', null);
            //        }
            //     });
            // } else {
                api.getAddonFile(package, version, fileName, callback); //'/addons/' + package + '/files/' + fileName
            // }
        },

        removeAddon: function (package) {
            var addon = cache.get('addons', package);
            if (!addon) return;

            cache.set('addons', package, null);

            // Remove views
            var replaced = [], removed = [], view;
            for (var uid in t7.global.addonViews) {
                view = t7.global.addonViews[uid];
                if (view.package != package)
                    replaced.push(view);
                else
                    removed.push(view);
            }
            t7.global.addonViews = replaced;

            // Trigger events
            for (i = 0; i < removed.length; i++) {
                addons.onViewRemoved(addon, removed[i]);
            }

            addons.onAddonRemoved(addon);

            // TODO: remove addon related templates, JS and CSS files?
        },

        initAddon: function (addon) {
            var package = addon.package,
                version = addon.version;

            // addon.path = util.addonAssetPath(package, version, null);
            // addon.url = util.addonAssetUrl(package, version, null, true);

            cache.set('addons', package, addon);
            this.onAddonLoaded(addon);

            if (addon.views && addon.views.length) {

                // Setup template context
                // if (!t7.global.addons[addon.package])
                //     t7.global.addons[addon.package] = {};
                //
                // t7.global.addons[package].path = addon.basePath;
                // t7.global.addons[package].url = addon.baseUrl;

                var isManager = config.isTeamOwnerOrManager();

                // Add each of the views to the interface
                for (var i = 0; i < addon.views.length; i++) {
                    var view = addon.views[i];

                    // NOTE: API now only serves up visible viws so we just
                    // render everything on the client side
                    // If `view.manager` is true OR false we conditionally show
                    // OR hide the view depending on manager status
                    // if (typeof(view.manager) !== 'undefined' &&
                    //     view.manager !== isManager) {
                    //     console.log('skipping view', view.manager, isManager)
                    //     continue;
                    // }

                    switch(view.type) {
                        // case 'template':
                        //     this.loadTemplate(addon, view);
                        //     break;
                        case 'page':
                            this.initPageView(addon, view);
                            break;
                        default:
                            alert('Unknown view type: ' + view.type);
                    }
                }
            }
        },

        initPageView: function (addon, view) {
            var package = addon.package,
                version = addon.version;

            // Add some shortcuts to addon data on the view object
            view.package = package;
            view.uid = package + '-' + view.id;
            view.icon_url = addon.icon_url;

            // if (!view.path)
            //     view.path = util.joinPath(addon.path, '/files/', view.file);
            // if (!view.url)
            //     view.url = util.joinPath(addon.path, '/files/', view.file);

            // if (!view.path)
            //     view.path = util.addonAssetPath(package, version, view.file);
            // if (!view.url)
            //     view.url = util.addonAssetUrl(package, version, view.file);

            if (view.default) {
                t7.global.addonViews[view.uid] = view;
            }

            // Evaluate queued JavaScripts after animation completes
            // addons.addons.evalPageJavaScript(view);
            if (view.assets && view.assets.length) {
                for (var i = 0; i < view.assets.length; i++) {
                    var asset = view.assets[i],
                        url = util.addonAssetUrl(package, version, asset.file, true),
                        loaded = false;
                    console.log('loading addon asset', package, asset)

                    // TODO: use inArray or similar
                    for (var x = 0; x < addons.loadedAssetURLs.length; x++) {
                        if (addons.loadedAssetURLs[x] == url)
                            loaded = true;
                    }

                    if (loaded) {
                        console.log('already loaded asset', url);
                        continue;
                    }

                    switch(asset.type) {
                        case 'javascript':
                            var script = document.createElement('script');
                            script.type = 'text/javascript';
                            script.src = url; //asset.url;
                            document.body.appendChild(script);
                            break;
                        case 'stylesheet':
                            var style = document.createElement('link');
                            style.rel = 'stylesheet';
                            style.href = url; //asset.url;
                            document.body.appendChild(style);
                            break;
                        case 'template':
                            this.loadTemplate(url);
                            break;
                        default:
                            alert('Unknown asset type: ' + asset.type);
                    }

                    addons.loadedAssetURLs.push(url);
                }
            }

            cache.set('addonViews', view.uid, view);

            console.log('add addon view', view);
            this.onViewLoaded(addon, view);
        },

        loadTemplate: function (url) { //addon, view
            // var viewPath = util.addonAssetUrl(addon.package, addon.version, view.file, true); //
            // $$.get(viewPath, function (data) {
            $$.get(url, function (data) {
                $$('body').append(data);
            });
        },

        // loadManifest: function (package, version, callback) { //, local
        //     console.log('load addons', package, version); //, local
        //     var self = this;
        //     this.loadFile(package, version, 'addon.yml', function (res) { //err, , local
        //         var addon = jsyaml.load(res); //JSON.parse(res);
        //         // addon.local = local;
        //         // cache.set('addons', package, 'local', local);
        //         self.initAddon(addon);
        //         if (callback)
        //             callback(addon);
        //     });
        // },

        loadAddon: function (package, version, callback) {
            api.getAddonVersion(package, version).then(function (response) {
                console.log('addon response', response);
                addons.initAddon(response);

                if (callback)
                    callback(response);
            });
        },

        // Get installed addons from the API
        loadAllRemote: function (callback) {
            api.getInstalledAddons().then(function (response) {
                console.log('installed addons response', response);
                for (var i = 0; i < response.length; i++) {
                    var addon = response[i];
                    if (addon && //.addon
                        addon.views) { //.addon
                        addons.initAddon(addon); //.addon
                        // self.load(addon.package, addon.version, false);
                    }
                }

                if (callback)
                    callback(response);
            });
        },

        getAddons: function () {
            return cache.get('addons');
        },

        getAddon: function (package, version) {
            // FIXME: version not mapped but should be in future
            return cache.get('addons', package);
        },

        getViews: function (package, viewId) {
            return cache.get('addonViews');
        },

        getView: function (package, viewId) {
            return cache.get('addonViews', package + '-' + viewId);
        },

        currentAddon: function () {
            return t7.global.currentAddon;
        },

        currentActorID: function () {
            return t7.global.currentActorId;
        },

        currentActorOrUserID: function () {
            return t7.global.currentActorId ? t7.global.currentActorId : config.getCurrentUser().id;
        },

        onAddonLoaded: function (addon) {
            console.log('on addon loaded', addon);
            // alert('virtual method');
        },

        onAddonRemoved: function (addon) {
            console.log('on addon removed', addon);
            // alert('virtual method');
        },

        onViewLoaded: function (addon, view) {
            console.log('on view loaded', addon, view);
            // alert('virtual method');
        },

        onViewRemoved: function (addon, view) {
            console.log('on view removed', addon, view);
            // alert('virtual method');
        },

        // prepareView: function (addon, view) { //, data
        //     // alert('prepareView: implement me');
        //     var self = this,
        //         package = addon.package,
        //         // local = cache.get('addons', package).local, //, 'local'
        //         path = self.viewPath(addon.package, addon.version, view.file), //, 'local'
        //         url = self.viewPath(addon.package, addon.version, view.file, true); //, //, 'local'
        //         // $page = $$(data),
        //         // pageContent;
        //
        //     // // HTML content of new page
        //     // if (view.framed) {
        //     //     pageContent = '' +
        //     //       '<div class="navbar">' +
        //     //         '<div class="navbar-inner">' +
        //     //           '<div class="left"><a href="#" class="back link icon-only"><i class="material-icons md-36">keyboard_arrow_left</i></a></div>' +
        //     //           '<div class="center sliding">' + view.title + '</div>' +
        //     //           // '<div class="right">' +
        //     //           //   '<a href="#" class="link icon-only open-panel"> <i class="icon icon-bars"></i></a>' +
        //     //           // '</div>' +
        //     //         '</div>' +
        //     //       '</div>' +
        //     //       // '<div class="pages">' +
        //     //         '<div class="page addon-' + view.id + '" data-page="' + view.id + '">' +
        //     //           '<div class="page-content">' +
        //     //             '<iframe width="100%" height="100%" frameborder="0" seamless="seamless"></iframe>' +
        //     //           '</div>' +
        //     //         '</div>' //+
        //     //       // '</div>'
        //     //       ;
        //     // }
        //     // else {
        //     //     pageContent = data;
        //     // }
        //
        //     // Parse JavaScripts to be evaluated
        //     // var js = '', jsSrcs = [];
        //     // var $scripts = $$('<div>').html(data).find('script[type="text/javascript"]').remove();
        //     // $scripts.each(function () {
        //     //     var $this = $$(this);
        //     //     if ($this.attr('src'))
        //     //         jsSrcs.push($this.attr('src'));
        //     //     else
        //     //         js += $this.text();
        //     // });
        //     //
        //     // var $templates = $$('<div>').html(data).find('script[type="text/t7"]').remove();
        //     // $templates.each(function () {
        //     //     $$('body').append(this);
        //     // });
        //
        //     return view;
        // },

        //     this.loadFile(package, version, view.file, local, function (res) {
        //
        //         // Render view template
        //         res = util.compilet7(res, {
        //             // basePath: basePath,
        //             view: view //,
        //             // addon: addon,
        //             // data: T.env.data
        //         });
        //         view = self.prepareView(addon, view, res);
        //
        //         t7.global.addons[addon.package].path = view.path;
        //         if (view.visible) {
        //             t7.global.addonViews[view.uid] = view;
        //         }
        //
        //         self.onViewLoaded(view);
        //
        //         // $$(document).trigger('tommy:addon:view:create', {
        //         //     package: package, addon: addon, view: view });
        //     });

        // showView: function (package, viewId) {
        //     var view = this.getView(package, viewId);
        //     if (!view)
        //         throw 'Unknown view for ' + package + ' and ' + viewId;
        //
        //     tommyView.router.loadContent(view.html);
        //
        //     // var view = this.views[viewId],
        //     //   addon = cache.get('addons', view.package, 'addon');
        //     // tommyView.router.load({
        //     //     // template: t7.templates.aboutTemplate, // template already compiled and available as a property of t7.templates
        //     //     content: view.html,
        //     //     context: {
        //     //         basePath: this.basePath(addon.package, addon.version),
        //     //         view: view,
        //     //         // addon: addon,
        //     //         data: T.env.data
        //     //     }
        //     // })
        // },

        // evalPageJavaScript: function (view) {
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
    };

    return addons;
});
