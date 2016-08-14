require(['app','api','util','cache','tplManager'],
function (app,api,util,cache,tplManager) {

    // Setup router
    app.f7.onPageInit('poke_main', initContacts);

    // Initialize the main contacts page
    function initContacts(page) {
        app.f7.showPreloader('Loading Contacts...');

        api.getContacts(function(response) {
            app.f7.hidePreloader();
            var $element = tplManager.renderInline('poke_contactListTemplate', response);
            $element.find('a').click(function() {
              var $link = $$(this),
                  userId = $link.data('user-id'),
                  firstName = $link.data('first-name');
              app.f7.alert('Would you like to poke ' + firstName + '?', 'Confirm', function() {
                  pokeUser(userId, firstName);
              });
              return false;
            });
        });
    }

    // Send the poke message to the recipient
    function pokeUser(userId, firstName) {
        api.sendDirectMessage(userId, 'You\'ve been Poked!', null, function(response) {
            console.log('send message response', response);
            app.f7.addNotification({
                message: ('You poked ' + firstName + '!')
            });
        });
    }
});
