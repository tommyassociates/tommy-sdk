/** Class: Tommy.Environment
 *  An object container for all Tommy Environment library functions.
 *
 *  This class is just a container for all the objects and constants
 *  used in the library.  It is not meant to be instantiated, but to
 *  provide a namespace for library objects, constants, and functions.
 */

Tommy.Environment = {

    /**
     *  Object containing all loaded extension package objects scoped by package name.
     */

    extensions: {},

    /**
     *  The Framework7 application instance (available for mobile extensions only).
     */

    f7App: null,

    /**
     *  The Framework7 view instance (available for mobile extensions only).
     */

    f7View: null
};

// Assign a short accessor for the Tommy.Environment object
window.T.Env = Tommy.Environment;
