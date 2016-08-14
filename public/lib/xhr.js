define(['util','config','i18n!nls/lang','Framework7'], //,'networkStatus'
function (util,config,i18n) {
    var $$ = Dom7;

    var xhr = {
        init: function() {
            $$(document).on('ajaxStart', function(e) {
                var xhr = e.detail.xhr;
                xhr.setRequestHeader('Authorization', 'Token ' + config.getSessionToken());

                // TODO: add hide indicator flag to xhr to prevent
                tommyApp.showIndicator();
                // console.log('Ajax request started', e);
            });

            $$(document).on('ajaxComplete', function(e) {
                tommyApp.hideIndicator();
                util.hideLoader();
                // console.log('Ajax request complete', e);
            });
        },

        call: function (options, successCallback, errorCallback) {
            options = options || {};
            options.method = options.method || 'GET';
            // options.data = options.data ? options.data : '';

            // Check network connection
            if (util.isPhonegap()) {
                var network = util.checkConnection();
                if (network === 'NoNetwork') {
                    tommyApp.alert(i18n.error.no_network, function () {
                        tommyApp.hideIndicator();
                        util.hideLoader();
                    });

                    return false;
                }
            }

            // var url = options.url ? options.url : config.getApiUrl();
            // if (options.func)
            //     url += options.func;

            // xhr.getRequestURL(options);
            console.log('xhr: call', options);

            return $$.ajax({
                url: options.url,
                method: options.method,
                data: options.data,
                crossDomain: true,
                // dataType: 'text',
                success: function (data, status, xhr) {

                    // Convert response to a JSON object if it is a JSON string
                    try {
                        data = JSON.parse(data);
                    } catch(e) {
                        // tommyApp.alert('Invalid API JSON response: ' + data);
                    }

                    console.log('xhr: call: success', options.url, data);

                    // $$('#overlay-error').hide();
                    if (typeof(successCallback) === 'function') {
                        successCallback(data);
                    }

                    // tommyApp.hideIndicator();
                    // util.hideLoader();

                    // $$('#overlay-error').hide();
                    // data = data ? JSON.parse(data) : '';
                    //
                    // var codes = [
                    //     {code:10000, message:'Your session is invalid, please login again',path:'/'},
                    //     {code:10001, message:'Unknown error,please login again',path:'tpl/login.html'},
                    //     {code:20001, message:'User name or password does not match',path:'/'}
                    // ];
                    //
                    // var codeLevel = xhr.search(data.status,codes);
                    //
                    // if(!codeLevel) {
                    //     (typeof(successCallback) === 'function') ? successCallback(data) : '';
                    // }
                    // else {
                    //     tommyApp.alert(codeLevel.message,function () {
                    //         if(codeLevel.path !== '/')
                    //             tommyView.router.loadPage(codeLevel.path);
                    //
                    //         tommyApp.hideIndicator();
                    //         util.hideLoader();
                    //     });
                    // }
                },
                error: function (xhr, status) {
                    console.log('xhr: call: error', xhr, status);
                    // console.log(JSON.stringify(data));

                    // tommyApp.hideIndicator();
                    // util.hideLoader();

                    try {
                        var json = JSON.parse(xhr.responseText);
                        if (json.message)
                            tommyApp.alert(json.message);

                        // switch(json.status) {
                        //     case 422:
                        //     default:
                        //        tommyApp.alert(json.message);
                        //        break;
                        // }

                        if (typeof(errorCallback) === 'function') {
                            errorCallback(json);
                        }
                    } catch (error) {
                        if (status === 500) {
                            tommyApp.alert('Internal server error');
                            // $$('#overlay-error').html('No Internet Connection');
                            // $$('#overlay-error').show();
                        } else {
                            tommyApp.alert('Invalid API response: ' + xhr.responseText);
                        }
                    }

                    setTimeout(function () {
                        $$('#overlay-error').hide();
                    }, 2000);

                    // if(textStatus === 200) {
                    //     var res = JSON.parse(data.response);
                    //     console.log(res);
                    //     // if(res.error == 'token_expired')  {
                    //         // $$('#overlay-error').html('Token has expired. Please login again.');
                    //         $$('#overlay-error').show();
                    //         tommyView.router.loadPage('views/login.html');
                    //     // }
                    //     // else {
                    //         // $$('#overlay-error').html('Oops! Something went wrong.');
                    //         // $$('#overlay-error').show();
                    //     // }
                    // }
                    // else if(textStatus === 400) {
                    //         // $$('#overlay-error').html('Token has expired. Please login.');
                    //         // $$('#overlay-error').show();
                    //         tommyView.router.loadPage('views/login.html');
                    // }
                    // else if(textStatus === 404) {
                    //     var data = JSON.parse(data.response);
                    //
                    //     if(data.error == 'user_not_found') {
                    //         config.destorySession();
                    //         tommyView.router.reloadPage('views/login.html');
                    //     }
                    //     else{
                    //         $$('#overlay-error').html('No Internet Connection.');
                    //         $$('#overlay-error').show();
                    //     }
                    // }
                    // else if(textStatus === 500) {
                    //     $$('#overlay-error').html('Internal Server Error. Please try again.');
                    //     $$('#overlay-error').show();
                    // }
                    // else {
                    //     // $$('#overlay-error').html('Oops! Something went wrong.');
                    //     // $$('#overlay-error').show();
                    //     // tommyView.router.loadPage('views/login.html');
                    //     if(options.func === 'login') {
                    //         util.hideLoader();
                    //         tommyApp.alert('Connection Problem. Please verify your internet connection and try again.');
                    //     }
                    //     else {
                    //         $$('#overlay-error').html('Connection Problem. Please try again.');
                    //         $$('#overlay-error').show();
                    //     }
                    // }
                }
            });
        }

        // search: function (code, array) {
        //     for (var i = 0; i < array.length; i++) {
        //         if (array[i].code === code) {
        //             return array[i];
        //         }
        //     }
        //     return false;
        // },
        //
        // getRequestURL: function (options) {
        //     var query = options.query || {};
        //     var func = options.func || '';
        //     var apiServer = (options.url || config.getDeprecatedApiUrl()) + func + (util.isEmpty(query) ? '' : '?');
        //
        //     for (var name in query) {
        //         apiServer += name + '=' + query[name] + '&';
        //     }
        //
        //     var token = config.getSessionToken();
        //     if (token && util.isEmpty(query)) {
        //         apiServer += '?token=' + token;
        //     }
        //     else if(token) {
        //         apiServer += 'token=' + token;
        //     }
        //
        //     return apiServer.replace(/&$/gi, '');
        // },

    };

    xhr.init();

    return xhr;
});
