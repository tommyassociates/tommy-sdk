if (typeof Tommy === 'undefined')
    var Tommy = {};

/** Class: Tommy.Util
 *  Static utility functions used by Tommy.
 */

Tommy.Util = {

    /** Function: compileTemplate7
     *  Compile a Template7 template.
     */

    compileTemplate7: function(template, context) {
        // console.log('Compiling template7', template, context)
        var compiledTemplate = Template7.compile(template);
        return compiledTemplate(context);
    },

    /** Function: renderTemplate7
     *  Render a Template7 template.
     */

    renderTemplate7: function(template, context, element) {
        console.log('Rendering template7', template, context)
        var html = this.compileTemplate7($$('#' + template).html(), context);
        if (element)
            $$(element).html(html);
        return html;
    },

    replaceWith: function(string, expression, replace) {
        return string.replace(new RegExp(expression, 'g'), replace);
    },

    /** Function: parameterize
     *  Parameterize or hyphenate a string.
     */

    parameterize: function(str) {
        return str.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
    },

    handleAPIError: function(err, baseMessage) {
        if (!err) return false;
        var message = '';
        if (baseMessage) {
            message += baseMessage;
            message += ': ';
        }
        message += err;
        T.env.f7App.alert(message);
        return true;
    }
}

// Assign a short accessor for the Tommy.Util object
if (typeof window.T !== 'undefined')
    window.T.util = Tommy.Util;
