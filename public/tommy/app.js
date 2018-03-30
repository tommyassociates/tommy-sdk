define(['Framework7','tplHelpers','config'], //,'Framework73D'
function(Framework7,TH,config) { //,Framework73D
    var app = {

        // The Framework7 application instance
        f7: null,

        // The Framework7 main view instance
        f7view: null,

        // The Template7 instance
        t7: Template7,

        // Example Options:
        //
        // {
        //     pushState: false, // config.environment == 'development', // breaks controller initialization but handy for dev
        //     popupCloseByOutside:false,
        //     animateNavBackIcon: true,
        //     cache: true,
        //     template7Pages: true,
        //     modalTitle: i18n.global.modal_title,
        //     modalButtonOk: i18n.global.modal_button_ok,
        //     modalButtonCancel: i18n.global.cancel,
        //     preprocess: router.preprocess,
        //     tapHold: true,
        //     swipeBackPage: false,
        //     smartSelectBackTemplate: '<div class="left sliding"><a href="#" class="back link icon-only"><i class="material-icons md-36">keyboard_arrow_left</i></a></div>'
        // }
        //
        init: function(options) {
            // window.$$ = Dom7;
            if (!window.tommy)
                window.tommy = {}
            this.f7 = window.tommy.f7 = new Framework7(options)
            this.f7view = window.tommy.f7view = this.f7.addView('.view-main', {
                dynamicNavbar: true,

                // NOTE: Setting this to false as multiple instances of pages with
                // duplicate data-page names were getting inserted into the dom.
                // If a workaround can be found this can be reenabled.
                domCache: false
            })

            if (!app.t7.global)
                app.t7.global = {};

            // Handle global window errors
            window.onerror = function (msg, url, lineNo, columnNo, error) {
                console.log('Global error', msg, url, lineNo, columnNo, error)

                // NOTE: should be cleared before page load in router
                window.tommy.lastError = msg;
                return false;
            }

            if (window.device && window.device.platform == 'Android')
                app.initAndroidHacks()

            app.initToggleSaveNavbarButton()
            app.initDynamicActions()
            app.initDynamicSubmitButtons()
            app.initMobileFirendlyFormTabbing()
            TH.init();
        },

        setPageTitle: function (html) {
           $$('.view-main').find('.navbar-on-center .center').html(html)
        },

        hideToolbar: function () {
            app.f7.hideToolbar('.toolbar')
        },

        showToolbar: function () {
            app.f7.showToolbar('.toolbar')
        },

        enableSwipeMenu: function () {
            app.f7.params.swipePanel = 'left';
            $$('#main-menu-drag-handle').show()
        },

        disableSwipeMenu: function () {
            app.f7.params.swipePanel = false;
            $$('#main-menu-drag-handle').hide()
        },

        showLoader: function () { //text, force
            // window.tommy.app.showIndicator()
            var $pre = $$('.navbar .left')
            $pre.find('.preloader').remove()
            $pre.append('<span class="preloader"></span>')
        },

        hideLoader: function () {
            // window.tommy.app.hideIndicator()
            var $pre = $$('.navbar .left')
            $pre.find('.preloader').remove()

            // NOTE: Disabling the loading button here isn't ideal since we
            // don't know if this call matches the button's original request,
            // but it will do in a pinch.
            app.resetLoadingButton()
        },

        renderCurrentAvatar: function () {
            // console.log('renderCurrentAvatar', $$('.current-avatar').length, config.getCurrentAvatar())
            $$('.current-avatar').attr('src', config.getCurrentAvatar())
            $$('.current-avatar').parent().find('.badge').remove()
            $$('.current-avatar-background').attr('style', 'background-image: url(' + config.getCurrentAvatar() + ')')
        },

        setUserOnlineStatus: function(user_id, flag) {
            console.log('Set user online ', user_id, flag)
            var $e = $$('[data-online-state="' + user_id + '"]')
            if ($e.length) {
                if (flag === false)
                    $e.removeClass('online').addClass('offline')
                else
                    $e.removeClass('offline').addClass('online')
            }
        },

        replaceNativeBackButton: function (page) {
            // var callback = window.tommy.app.onPageBeforeAnimation('*', function(page) {
            console.log('replacing native back button', page)
            var $page = $$(page.container),
                $navbar = $$(page.navbarInnerContainer)
            $navbar.find('.left .link').remove()
            $navbar.find('.left').prepend('<a href="tommy://backToApp" class="back link icon-only external"><i class="material-icons md-36">keyboard_arrow_left</i></a>')
            // callback.remove()
            // })
            // return callback;
        },

        handleAPIError: function (err, baseMessage) {
            if (!err) return false;
            if (!window.tommy) return false;

            // Set the `lastError` since the error may not be thrown becuase of
            // Promise scope
            // NOTE: should be cleared before each page load in router.js
            window.tommy.lastError = message;

            // Hide certain messages
            if (err.indexOf('Not authorized') !== -1) {
                return;
            }

            var message = '';
            if (baseMessage) {
                message += baseMessage;
                message += ': ';
            }
            message += err;
            window.tommy.app.alert(message)
            return true;
        },

        setLoadingButton: function (element) {
            var $element = $$(element)
            $element.prop('disabled', true)
            $element.addClass('loading disabled')
        },

        resetLoadingButton: function (element) {
            if (!app.f7view || !app.f7view.activePage)
                return

            var $element = element ? $$(element) : $$(app.f7view.activePage.container).find('.loading')
            if ($element.length) {
                $element.prop('disabled', false)
                $element.removeClass('loading disabled')
            }
        },

        initToggleSaveNavbarButton: function () {
            app.f7.onPageAfterAnimation('*', function(page){
                var $page = $$(page.container)
                if ($page.hasClass('with-toggle-save')) {
                    $page.once('change', '.toggle-save', function() {
                        var $button = $$(page.navbarInnerContainer).find('.save')
                        $button.addClass('active')
                        $button.once('click', function() {
                            $button.removeClass('active')
                        })
                    })
                }
            })
        },

        // Bind submit buttons that exist outside of form scope such as in the
        // navbar or toolbar

        initDynamicSubmitButtons: function () {
            $$(document).on('click', 'a[data-submit]', function (event) {
                app.setLoadingButton(event.currentTarget)
                $$(app.f7view.activePage.container).find('form' + $$(this).data('submit')).trigger('submit')
                event.preventDefault()
            })
        },

        // Global actions
        actionListeners: {},
        initDynamicActions: function () {
            $$(document).on('click', 'a[data-action]', function (event) {
                event.preventDefault()
                app.f7.closeModal()
                var action = $$(this).data('action'),
                    func = app.actionListeners[action];
                if (func) {
                    func(event)
                }
                else {
                    console.log('No action handler for ', action)
                }
            })
        },

        initMobileFirendlyFormTabbing: function () {

            // Add tabIndex attrs to form inputs when loading the page
            this.f7.onPageBeforeAnimation('*', function (page) {
                $$(page.container).find('form').each(function() {
                    var $inputs = $$(this).find('input, select, button')
                    if ($inputs.length > 1) {
                        $inputs.each(function (i) { $$(this).attr('tabindex', i + 1) })
                        console.log('add tabindex to form')
                    }
                })
            })

            // Allow using enter to tab through forms
            $$(document).on('keypress', function(e) {
                if (e.which == 13) {
                    e.preventDefault()
                    var that = document.activeElement;
                    var index = that.tabIndex + 1;

                    // var $next = $inputs.filter(function(i, el) {
                    //     if (i == index + 1) return this;
                    // })

                    var $next = $$('input[tabIndex="' + (index) + '"]')
                    // console.log('input enter pressed $next', $next)
                    if ($next.length) {
                        $next[0].focus()
                        $$(window).trigger('resize') // center the next element
                    }
                    else {
                        $$(that).blur()
                        $$(that.form).trigger('submit')
                    }
                }
            })
        },

        initAndroidHacks: function () {
            $$(document).on('focusin', 'input', function(event) {
                // console.log('focusin center input', event)
                // var $container = $$(app.f7view.activePage.container).find('.page-content'),
                //     $input = $$(this)
                // $container.append('<div class="scroll-spacer" style="height:1000px;"></div>')
                // var offset = $container.scrollTop() + $input.offset().top - 120;
                // $container.scrollTop(offset, 300)
                // scrolled = true;

                var $page = $$(app.f7view.activePage.container)
                if ($page.hasClass('toolbar-fixed')) {
                    $page.find('.toolbar-bottom').hide()
                    // var $toolbar = $page.find('.toolbar-bottom')
                    // $toolbar.hide()
                    // var offset = $toolbar.outerHeight() // + 30;
                    // $page.find('.page-content').css('margin-top', -(offset) + 'px')
                }

                // .find('.page-content')
            })

            $$(document).on('focusout', 'input', function(event) {
                // console.log('focusout center input', event)
                // var $container = $$(app.f7view.activePage.container).find('.page-content')
                // if (!scrolled) return;
                // setTimeout(function() {
                //     if ($$('input:focus').length) return;
                //     $container.find('.scroll-spacer').remove()
                //     $container.scrollTop(0, 300)
                //     scrolled = false;
                // }, 250)

                // var $container = $$(app.f7view.activePage.container).find('.page-content')
                // $container.css('margin-top', 0)
                var $page = $$(app.f7view.activePage.container)
                if ($page.hasClass('toolbar-fixed')) {
                    $page.find('.toolbar-bottom').show()
                    // var $toolbar = $page.find('.toolbar-bottom')
                    // $toolbar.hide()
                    // var offset = $toolbar.outerHeight() // + 30;
                    // $page.find('.page-content').css('margin-top', -(offset) + 'px')
                }
            })

            // Use window resize to detect keyboard and center the focused input
            // elements on the screen
            // var scrolled = false;
            // window.addEventListener('resize', function(){
            //     if (document.activeElement.tagName == 'INPUT' ||
            //         document.activeElement.tagName == 'SELECT') {
            //         window.setTimeout(function(){
            //           //  document.activeElement.scrollIntoViewIfNeeded()
            //
            //           var $container = $$(app.f7view.activePage.container).find('.page-content'),
            //               $input = $$(document.activeElement)
            //           var offset = $container.scrollTop() + $input.offset().top - 100;
            //           $container.append('<div class="scroll-spacer" style="height:1000px;"></div>')
            //           $container.scrollTop(offset, 300)
            //           scrolled = true;
            //         }, 0)
            //     }
            //     // else if (scrolled) {
            //     //     var $container = $$(app.f7view.activePage.container).find('.page-content')
            //     //     $container.find('.scroll-spacer').remove()
            //     //     $container.scrollTop(0, 300)
            //     //     scrolled = false;
            //     // }
            // })
        }
    };

    return app;
})
