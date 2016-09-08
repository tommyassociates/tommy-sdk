require(['app','api','util','cache','tplManager','moment'],
function (app,api,util,cache,tplManager,moment) {

    //
    /// Bookings Context

    var Bookings = {

        // Item cache
        cache: {},

        addEvent: function (item) {
            Bookings.cache[item.id] = item;
            console.log('booking added', item)
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
            params = Object.assign({ kind: 'booking' }, params);
            return api.getEvents(params).then(Bookings.addEvents);
        },

        eventsGroupByDate: function () {
            var items = {};
            for (var id in Bookings.cache) {
                var item = Bookings.cache[id],
                    status = moment(item.start_at).format('D MMM');
                if (!items[status])
                    items[status] = [];
                items[status].push(item);
            }
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
            console.log('invalidating main agent_bookings', Bookings.eventsGroupByDate())
            tplManager.renderInline('agent_bookings__bookingListGroupTemplate', Bookings.eventsGroupByDate(), page.container);
        }
    }

    //
    /// Booking Details

    var BookingDetails = {
        init: function (page) {
            var event = Bookings.cache[page.query.event_id];

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
    //
    //
    // // -------------------------------------------------------------------------
    // // TESTS
    //
    // //
    // /// Test Fixtures
    // //
    //
    // var Fixtures = {
    //     create: function () {
    //         console.log('creating event fixtures')
    //
    //         // loop weeks for the next 100 days
    //
    //         var now = moment(),
    //             startDate = now.clone().startOf('day').subtract(100, 'days'),
    //             endDate = now.clone().startOf('day'),
    //             currDate = startDate.clone().startOf('day');
    //
    //         // console.log('DIFF', startDate.format('M/D/YYYY'), endDate.format('M/D/YYYY'), currDate.format('M/D/YYYY'), currDate.add('days', 1).diff(endDate));
    //         while(currDate.add(7, 'days').diff(endDate) < 0) {
    //             var startWeekDate = currDate.clone(),
    //                 endWeekDate = currDate.clone().add('days', 7);
    //             var data = {
    //                 start_date: startWeekDate.format('D/M/YYYY'),
    //                 end_date: endWeekDate.format('D/M/YYYY')
    //             }
    //             console.log('create event', data);
    //             api.createEvent(data).then(function(response) {
    //                 console.log('created event', response);
    //
    //                 // create shift event every two days
    //                 while(startWeekDate.add(2, 'days').diff(endWeekDate) < 0) {
    //                     var eventData = {
    //                         title: 'Bartender',
    //                         location: 'Sydney',
    //                         start_at: startWeekDate.format(),
    //                         end_at: startWeekDate.clone().add('hours', 8.2).format(),
    //                         resource_id: response.id,
    //                         resource_type: 'Event'
    //                     }
    //                     console.log('create event', eventData);
    //                     api.createEvent(eventData).then(function(eventResponse) {
    //                         console.log('created event', eventResponse);
    //                     });
    //                     // return;
    //                 }
    //             });
    //             // return;
    //         }
    //     }
    // }
    //
    // // Fixtures.create();
});
