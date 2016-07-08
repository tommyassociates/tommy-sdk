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

    /** Variable: api
     *  The Tommy API pointer assigned by the app.
     */

    api: null,

    /** Variable: env
     *  The Tommy Environment pointer assigned by the app.
     */

    env: null,

    /** Variable: util
     *  The Tommy Utilities accessor assigned in util.js.
     */

    util: null,
};

// Assign a short accessor for the Tommy object (window.T)
window.T = Tommy;
