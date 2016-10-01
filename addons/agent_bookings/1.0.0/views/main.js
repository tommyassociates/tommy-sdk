require(['app','api','addons','util','cache','tplManager','moment'],
function (app,api,addons,util,cache,tplManager,moment) {

    //
    /// Bookings Context

    var Bookings = {

        // Item cache
        cache: {},

        getEvent: function (id) {
            return Bookings.cache['_' + id];
        },

        addEvent: function (item) {
            Bookings.cache['_' + item.id] = item;
            console.log('booking added', item);
        },

        addEvents: function (items) {
            if (items && items.length) {
                for (var i = 0; i < items.length; i++) {
                    Bookings.addEvent(items[i]);
                }
            }
        },

        loadEvents: function (params) {
            console.log('load bookings', params);
            params = Object.assign({ kind: 'AgentBooking' }, params);
            return api.getEvents(params).then(Bookings.addEvents);
        },

        groupByCategory: function () {
            var items = { Current: [], Previous: [] },
                today = moment().startOf('day');
            for (var key in Bookings.cache) {
                var item = Bookings.cache[key],
                    category = moment(item.start_at) >= today ? 'Current' : 'Previous';
                    // date = moment(item.start_at).format('D MMM');
                // if (!items[category])
                //     items[category] = [];
                items[category].push(item);
            }
            if (!items.Current.length)
                delete items.Current;
            if (!items.Previous.length)
                delete items.Previous;
            // console.log('groupByCategory', items);
            return items;
        },
    };

    //
    /// Main View

    var Main = {
        init: function (page) {
            Bookings.loadEvents().then(function() {
                Main.invalidate(page);
            });
        },

        invalidate: function (page) {
            console.log('invalidating main agent_bookings', Bookings.groupByCategory())
            tplManager.renderInline('agent_bookings__bookingListGroupTemplate', Bookings.groupByCategory(), page.container);
        }
    }

    //
    /// Booking Details

    var BookingDetails = {
        init: function (page) {
            var event = Bookings.getEvent(page.query.event_id);

            tplManager.renderInline('agent_bookings__bookingDetailsTemplate', event, page.container);
        }
    }

    //
    /// Router

    app.f7.onPageInit('agent_bookings__main', Main.init);
    app.f7.onPageBeforeAnimation('agent_bookings__main', Main.invalidate);

    //
    /// Event Details

    app.f7.onPageInit('agent_bookings__booking-details', BookingDetails.init);
    app.f7.onPageBeforeAnimation('agent_bookings__booking-details', BookingDetails.init);

    // //
    // // /// Moderate Bookings
    // //
    // // app.f7.onPageInit('agent_bookings__moderate-agent_bookings', ModerateBookings.init);
    // // app.f7.onPageAfterAnimation('agent_bookings__moderate-agent_bookings', ModerateBookings.init);
    // //
    // // //
    // // /// Approve Bookings
    // //
    // // app.f7.onPageInit('agent_bookings__approve-agent_bookings', ApproveBookings.init);
    // // app.f7.onPageAfterAnimation('agent_bookings__approve-agent_bookings', ApproveBookings.init);
    //
    //
    // // -------------------------------------------------------------------------
    // // HELPERS
    //
    // var Helpers = {
    //     bookingStatusCategory: function (booking, useCurrent) {
    //         switch (booking.status) {
    //             case 'unsubmitted':
    //                 if (useCurrent && booking.endAt > (new Date()))
    //                     return 'Current';
    //                 return 'Unsubmitted';
    //             case 'submitted':
    //                 return 'Submitted';
    //             case 'approved':
    //                 return 'Approved';
    //             case 'denied':
    //                 return 'Denied';
    //         }
    //         alert('Invalid booking status: ' + booking.status);
    //     },
    //
    //     bookingStatus: function (booking) { //, useNew
    //         switch (booking.status) {
    //             case 'unsubmitted':
    //                 // if (useNew && booking.endAt > (new Date()))
    //                 //     return 'New';
    //                 return 'New';
    //             case 'submitted':
    //                 return 'Pending Approval';
    //             case 'approved':
    //                 return 'Approved';
    //             case 'denied':
    //                 return 'Denied';
    //         }
    //         alert('Invalid booking status: ' + booking.status);
    //     }
    // }
    //
    // //
    // /// Template7 Helpers
    // //
    //
    // app.t7.registerHelper('agent_bookings__bookingStatus', function (booking) {
    //     return Helpers.bookingStatus(booking);
    // });
    //
    // app.t7.registerHelper('agent_bookings__itemDurationIcon', function (seconds) {
    //     var text = '',
    //         data = util.minutesToHoursAndMinutes(seconds / 60);
    //     // if (value > 0) {
    //     //     value /= 60; // secs to minutes
    //     //     if (value > 60) {
    //     //         hours = Math.trunc(value / 60);
    //     //         minutes = value % 60;
    //     //     }
    //     //     else {
    //     //         minutes = value;
    //     //     }
    //     // }
    //     text += ('<span class="hours">' + data.hours + 'h</span>');
    //     // if (minutes > 0) {
    //         text += ('<small class="minutes">' + data.minutes + 'm</small>');
    //     // }
    //     return text;
    // });
    //
    // app.t7.registerHelper('agent_bookings__itemDurationHours', function (seconds) {
    //     var data = util.minutesToHoursAndMinutes(seconds / 60);
    //     if (data.minutes < 10) {
    //         data.minutes = '0' + data.minutes;
    //     }
    //     return data.hours + ':' + data.minutes;
    // });
    //
    //
    // app.t7.registerHelper('agent_bookings__humanizeMinutes', function (minutes) {
    //     var text = '',
    //         data = util.minutesToHoursAndMinutes(minutes);
    //     if (data.minutes > 60) {
    //         text += (data.hours + ' hours');
    //         if (data.minutes > 0) {
    //             text += (' and ' + data.minutes + ' minutes');
    //         }
    //     }
    //     else {
    //         text += (data.minutes + ' minutes');
    //     }
    //     return text;
    // });


    // -------------------------------------------------------------------------
    // TESTS

    //
    /// Test Fixtures
    //

    var Fixtures = {
        create: function () {
            console.log('creating event fixtures')

            var now = moment(),
                startDate = now.clone().subtract(10, 'days'), //.startOf('day') .subtract(100, 'days'),
                endDate = now.clone().add(30, 'days'), //.startOf('day')
                currDate = startDate.clone().startOf('day');

            // Create a single booking every day for the previous 10 and next 30 days
            while(currDate.add(2, 'days') < endDate) {
                // var startWeekDate = currDate.clone(),
                //     endWeekDate = currDate.clone().add('days', 7);
                // var data = {
                //     start_at: currDate.format('D/M/YYYY'),
                //     end_date: currDatee.clone().add(3, 'hours').format('D/M/YYYY')
                // }
                var data = {
                    title: 'Bartender',
                    location: 'Sydney',
                    start_at: currDate.format(),
                    end_at: currDate.clone().add(4.3, 'hours').format(),
                    resource_type: 'AddonInstall',
                    resource_id: addons.currentAddonInstallId(),
                    kind: 'AgentBooking'
                }
                console.log('create fixture event', data);
                api.createEvent(data).then(function(response) {
                    console.log('created fixture event', response);
                });
                // return;
            }
        }
    }

    // Fixtures.create();
});
