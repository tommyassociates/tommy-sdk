define(['Framework7','tplHelpers'], //,'Framework73D'
function(Framework7,TH) { //,Framework73D
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
            window.$$ = Dom7;
            window.tommyApp = this.f7 = new Framework7(options);
            window.tommyView = this.f7view = tommyApp.addView('.view-main', {
                dynamicNavbar: true
            });

            TH.init();
        }
    };

    return app;
});
