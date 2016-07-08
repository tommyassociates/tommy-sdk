// Show a loading indicator
T.env.f7App.showPreloader('Loading Users...');

// Get a list of accessible account contacts from the API
T.api.get('/contacts', {}, function(err, res) {
    console.log('contacts response', err, res);
    T.env.f7App.hidePreloader();
    if (err) {
        alert('API error: Could not fetch contacts');
        return;
    }
    T.util.renderTemplate7('addonPokeContactListTemplate', res, '#addon-poke-contacts');

    //   navItem.find('a').click(function(){
    //     T.env.f7App.alert('Would you like to poke ' + contact.user.first_name + '?',
    //                 'Confirm', function() {
    //       pokeUser(contact.user);
    //     });
    //     return false;
    //   });
});

function pokeUser(receiver) {
  T.api.create('/chat_messages', {
      receiver_id: receiver.id,
      message: 'You\'ve been Poked!'}, function(err, res) {
    console.log('send message response', err, res);
    if (err) {
      alert('API error: Could not send message');
      return;
    }

    T.env.f7App.addNotification({
      message: ('You have poked ' + receiver.first_name + '!')
    });
  });
}
