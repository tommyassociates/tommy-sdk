var Tommy;

/** Class: Tommy
 *  An object container for all Tommy library functions.
 *
 *  This class is just a container for all the objects and constants
 *  used in the library.  It is not meant to be instantiated, but to
 *  provide a namespace for library objects, constants, and functions.
 */

Tommy = {

    /** Constant: VERSION
     *  The version of the Tommy library.
     */

    VERSION: "0.1.0",

    /** Constant: API_VERSION
     *  The version of the Tommy API to use.
     */

    API_VERSION: "v1",

    /** Constant: API_ENDPOINT
     *  The Tommy API endpoint to use.
     */

    API_ENDPOINT: "http://localhost:3000"
}

/** Class: Tommy.API
 *  Create a Tommy.API object.
 *
 *  @param (string) apiKey - The developer API key to authenticate requests with.
 */

Tommy.API = function (apiKey)
{
    this.apiKey = apiKey;
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
        console.log('call', type, uri, params);

        params = params || {}
        // params = $.extend(this.credentials, params); //{ action: action },
        return $.ajax({
           url: Tommy.API_ENDPOINT + '/' + Tommy.API_VERSION + uri,
           data: params,
           type: type,
           headers: {
             'Authorization': 'Basic ' + btoa(this.apiKey)
           },
           success: function(data, status, xhr) {
             callback(null, data);
           },
           error: function(xhr, status, error) {
             callback(error || 'Bad request', null);
           }
        });
    }
}
