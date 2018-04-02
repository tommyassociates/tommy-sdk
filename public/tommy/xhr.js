define(['util','app','config','Framework7'],
function (util,app,config) {
    var $$ = Dom7;

    var xhr = {
        init: function() {
            $$(document).on('ajaxStart', function(e) {
                var xhr = e.detail.xhr;
                xhr.setRequestHeader('Authorization', 'Token ' + config.getSessionToken())

                // TODO: add hide indicator flag to xhr to prevent
                app.showLoader()
                // console.log('Ajax request started', e)
            })

            $$(document).on('ajaxComplete', function(e) {
                // window.tommy.f7.hideIndicator()
                app.hideLoader()
                // console.log('Ajax request complete', e)
            })
        },

        call: function (options, successCallback, errorCallback) {
            options = options || {};
            options.method = options.method || 'GET';
            // options.data = options.data ? options.data : '';

            // Check network connection
            if (util.isPhonegap()) {
                var network = util.checkConnection()
                if (network === 'NoNetwork') {
                    window.tommy.f7.alert('No internet connection', function () {
                        app.hideLoader()
                    })

                    return false;
                }
            }

            // var url = options.url ? options.url : config.getApiUrl()
            // if (options.func)
            //     url += options.func;

            // xhr.getRequestURL(options)
            console.log('xhr: call: ' + JSON.stringify(options))

            return $$.ajax({
                url: options.url,
                method: options.method,
                data: options.data,
                crossDomain: true,
                // dataType: 'text',
                success: function (data, status, xhr) {

                    // Convert response to a JSON object if it is a JSON string
                    try {
                        data = JSON.parse(data)
                    } catch(e) {
                        // window.tommy.f7.alert('Invalid API JSON response: ' + data)
                    }

                    console.log('xhr: call: success', options.url, data)

                    // $$('#overlay-error').hide()
                    if (typeof(successCallback) === 'function') {
                        successCallback(data)
                    }

                    // window.tommy.f7.hideIndicator()
                    // app.hideLoader()
                },
                error: function (xhr, status) {
                    console.log('xhr: call: error: ' + status + ': ' + xhr.responseText)
                    // console.log(JSON.stringify(data))

                    // window.tommy.f7.hideIndicator()
                    // app.hideLoader()

                    var json

                    try {
                        switch(status) {
                            case 401:
                               window.tommy.f7view.router.loadPage('views/login.html')
                            // default:
                            //    window.tommy.f7.alert(json.message)
                               break;
                        }

                        if (options.showErrorMessages !== false) {
                            json = JSON.parse(xhr.responseText)
                            if (json.message) {
                                app.handleAPIError(json.message)
                            }
                        }
                    } catch (error) {
                        if (options.showErrorMessages !== false) {
                            if (status === 500) {
                                app.handleAPIError('Internal server error')
                                // window.tommy.f7.alert('Internal server error')
                                // $$('#overlay-error').html('No Internet Connection')
                                // $$('#overlay-error').show()
                            } else {
                                app.handleAPIError(xhr.responseText, 'Invalid API response')
                                // window.tommy.f7.alert('Invalid API response: ' + xhr.responseText)
                            }
                        }
                    }
                    
                    console.log('errorCallback', xhr, status)
                    if (typeof(errorCallback) === 'function') {
                        errorCallback(json ? json : status)
                    }
                }
            })
        }
    };

    xhr.init()

    return xhr;
})
