if (typeof Tommy === 'undefined')
    var Tommy = {};

/** Class: Tommy.API
 *  Create a Tommy.API object.
 *
 *  @param (string) token - The Tommy API key to use for authenticating API requests.
 *  @param (string) version - The version of the Tommy API to use (default: v1).
 *  @param (string) version - The Tommy API endpoint URL to use (default: https://api.mytommy.com).
 */

Tommy.API = function (token, version, endpoint)
{
    this.token = token || Tommy.API_KEY;
    this.version = version || 'v1';
    this.endpoint = endpoint || 'https://api.mytommy.com';
};

Tommy.API.prototype = {

    /** Function: get
     *  Get a resource.
     *
     *  @param (string) uri - The API endpoint URI.
     *  @param (Object) params - The HTTP query params.
     *  @param (Object) callback - The async callback function.
     */

    get: function (uri, params, callback)
    {
        return this._call('GET', uri, params, callback);
    },

    /** Function: create
     *  Create a resource.
     *
     *  @param (string) uri - The API endpoint URI.
     *  @param (Object) params - The HTTP query params.
     *  @param (Object) callback - The async callback function.
     */

    create: function (uri, params, callback)
    {
        return this._call('POST', uri, params, callback);
    },

    /** Function: update
     *  Update a resource.
     *
     *  @param (string) uri - The API endpoint URI.
     *  @param (Object) params - The HTTP query params.
     *  @param (Object) callback - The async callback function.
     */

    update: function (uri, params, callback)
    {
        return this._call('PUT', uri, params, callback);
    },

    /** Function: delete
     *  Delete a resource.
     *
     *  @param (string) uri - The API endpoint URI.
     *  @param (Object) params - The HTTP query params.
     *  @param (Object) callback - The async callback function.
     */

    delete: function (uri, params, callback)
    {
        return this._call('DELETE', uri, params, callback);
    },

    /** Function: _call
     *  Private helper function for calling the API endpoint.
     *
     *  @param (string) type - The HTTP method type.
     *  @param (string) uri - The API endpoint URI.
     *  @param (Object) params - The HTTP query params.
     *  @param (Object) callback - The async callback function.
     *  @private
     */

    _call: function (type, uri, params, callback)
    {
        // console.log('tommy api call', type, uri, params);
        return $.ajax({
            url: this.endpoint + '/' + this.version + uri,
            data: params,
            type: type,
            headers: {
                'Authorization': 'Token ' + this.token
            },
            success: function(data, status, xhr) {
                // console.log('tommy api call success', type, uri, params, xhr);
                callback(null, data, xhr);
            },
            error: function(xhr, status, error) {
                var json = JSON.parse(xhr.responseText),
                    err = error || 'Bad request';
                if (json && json.message)
                    err = json.message;
                callback(err, null, xhr);
            }
        });
    }
}
