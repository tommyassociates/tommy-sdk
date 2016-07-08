/*** Class: Tommy.Environment
  *  Create a Tommy.Environment object.
  */

Tommy.Environment = function()
{
};

Tommy.Environment.prototype = {

    /**
     *  The Framework7 application instance (available for mobile addons only).
     */

    f7App: null,

    /**
     *  The Framework7 view instance (available for mobile addons only).
     */

    f7View: null,

    /**
     *  The Template instance (available for mobile addons only).
     */

    t7: null,

    /**
     *  Arbitrary data object stored in the environment genmerally containing
     *  session information.
     */

    data: {}
};
