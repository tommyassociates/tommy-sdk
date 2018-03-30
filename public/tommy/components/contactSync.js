define(['app','util','config','api'],
function (app,util,config,api) {

    var contactSync = {

        // List if contacts populated on init
        contactList: [],

        // Disable popovers and notifications when true
        silent: true,

        init: function () {
            return new Promise(function(resolve, reject) {

                // onComplete
                if (!navigator.contacts) {
                    contactSync.onError("Contacts sync not available.")
                    reject("Contacts sync not available.")
                    return
                }

                var fields = [
                    navigator.contacts.fieldType.displayName,
                    navigator.contacts.fieldType.name,
                    navigator.contacts.fieldType.emails,
                    navigator.contacts.fieldType.phoneNumbers
                ]

                contactSync.contactList = []

                var options = new ContactFindOptions()
                options.hasPhoneNumber = true

                navigator.contacts.find(fields,
                    function (contacts) {
                        contactSync.onSuccess(contacts)
                        // onComplete(null, contactSync.contactList)
                        resolve(contactSync.contactList)
                    },
                    function (contactError) {
                        contactSync.onError(contactError)
                        // onComplete(contactError, null)
                        reject(contactError)
                    }, options)
            });
        },

        onSuccess: function (contacts) {
            contactSync.contactList = []

            contacts.forEach(function(contact, index){
                var singleContact = {
                    first_name: (contact.displayName || contact.name.givenName),
                    last_name: (contact.name.familyName || ""),
                    email: (contact.emails ? contact.emails[0].value : ""),
                    mobile: (contact.phoneNumbers ? contact.phoneNumbers[0].value : "")
                }

                if (singleContact.first_name && (singleContact.email || singleContact.mobile)) {
                    contactSync.contactList.push(singleContact)
                }
            })
        },

        onError: function (contactError) {
            if (!contactSync.silent)
                app.f7.alert("Unable to import your contacts: " + contactError)
        },

        sync: function (onComplete) {
            // if (!contactSync.silent)
            //     app.f7.showPreloader('Searching contacts')

            return new Promise(function(resolve, reject) {
                contactSync.init().then(function(contacts) {
                    if (!contacts.length) {
                        reject('No contacts')
                        return
                    }

                    if (!contactSync.silent)
                        app.f7.showPreloader("Importing " + contactSync.contactList.length + " contacts")

                    api.importContacts(JSON.stringify(contacts)).then(function(response) {
                        if (!contactSync.silent)
                            app.f7.hidePreloader()
                        resolve(contacts)
                        // console.log(response)
                        // onComplete(null, response)
                    }).catch(function (error) {
                        // if (!contactSync.silent)
                        //     app.f7.hidePreloader()
                        contactSync.onError(error)
                        reject(error)
                    })
                    // app.f7.confirm('Found ' + contactList.length + ' contacts. Would you like to import them?',
                    //     function () {
                    //         contactSync.import()
                    //     },
                    //     function () {
                    //         app.f7.hidePreloader()
                    //     }
                    // )
                    // }
                }).catch(reject)
            })
        }
    }

    return contactSync
})
