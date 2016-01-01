/** Class: Tommy.Environment
  *  Create a Tommy.Environment object.
  */

Tommy.Environment = function()
{
};

Tommy.Environment.prototype = {

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
